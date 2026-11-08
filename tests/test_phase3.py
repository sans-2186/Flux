import base64
import csv
import io
import json
import statistics
import threading
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import fraud, llm, store, voice
from app.main import app

client = TestClient(app)
PNC_CSV = Path(__file__).resolve().parent.parent / "mock" / "pnc" / "transactions.csv"


@pytest.fixture(autouse=True)
def clean(tmp_path, monkeypatch):
    monkeypatch.setenv("FLUX_DATA_FILE", str(tmp_path / "users.json"))
    monkeypatch.setattr(store, "_users", None)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(llm, "_client", None)
    monkeypatch.setattr(voice, "_working_model", None)
    fraud.reset()


class FakeServer:
    """Fake Gemini REST server. `respond(path, body)` returns (status, json payload)."""

    def __init__(self, respond, models=()):
        self.requests = []
        self.list_calls = 0
        outer = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append((self.path, body))
                status, payload = respond(self.path, body)
                data = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                outer.list_calls += 1
                data = json.dumps({"models": [{"name": f"models/{m}", "supportedGenerationMethods": ["generateContent"]}
                                              for m in models]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def connect(self, monkeypatch):
        from google import genai
        from google.genai import types
        monkeypatch.setenv("GEMINI_API_KEY", "fake")
        monkeypatch.setattr(llm, "_client", genai.Client(
            api_key="fake", http_options=types.HttpOptions(base_url=f"http://127.0.0.1:{self.server.server_port}")))
        return self

    def close(self):
        self.server.shutdown()


def text_reply(text):
    return 200, {"candidates": [{"content": {"role": "model", "parts": [{"text": text}]}, "finishReason": "STOP"}]}


def audio_reply(pcm=b"\x01\x00" * 480, mime="audio/L16;codec=pcm;rate=24000"):
    part = {"inlineData": {"mimeType": mime, "data": base64.b64encode(pcm).decode()}}
    return 200, {"candidates": [{"content": {"role": "model", "parts": [part]}, "finishReason": "STOP"}]}


# ---------- voice ----------

def test_clean_for_speech_strips_markdown():
    assert voice.clean_for_speech("**Hi** there,\n\n# you `owe` $5") == "Hi there, you owe $5"


def test_pcm_to_wav_is_valid_audio():
    wav = voice.pcm_to_wav(b"\x00\x00" * 2400, 24000)
    with wave.open(io.BytesIO(wav)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()) == (1, 2, 24000, 2400)


def test_speak_without_key_returns_browser_fallback_with_200():
    r = client.post("/speak", json={"text": "hello **world**"})
    assert r.status_code == 200
    body = r.json()
    assert body["audio_base64"] is None and body["source"] == "browser_speech" and body["text"] == "hello world"


def test_speak_returns_playable_wav_from_gemini_tts(monkeypatch):
    fake = FakeServer(lambda path, body: audio_reply()).connect(monkeypatch)
    try:
        body = client.post("/speak", json={"text": "Hi **Maya**", "voice": "Puck"}).json()
        path, sent = fake.requests[0]
    finally:
        fake.close()
    assert body["source"] == f"gemini_tts:{voice.TTS_MODEL}" and body["mime_type"] == "audio/wav"
    with wave.open(io.BytesIO(base64.b64decode(body["audio_base64"]))) as w:
        assert w.getframerate() == 24000 and w.getnframes() == 480
    assert voice.TTS_MODEL in path
    assert sent["generationConfig"]["responseModalities"] == ["AUDIO"]
    assert sent["generationConfig"]["speechConfig"] == {"voice_config": {"prebuilt_voice_config": {"voice_name": "Puck"}}}
    assert sent["contents"][0]["parts"][0]["text"] == "Hi Maya"


def test_speak_uses_backup_tts_model_when_primary_fails(monkeypatch):
    monkeypatch.setattr(voice, "TTS_CHAIN", ["primary-tts", "backup-tts"])
    fake = FakeServer(lambda path, body: (404, {"error": {"code": 404, "message": "model not found", "status": "NOT_FOUND"}})
                      if "primary-tts" in path else audio_reply()).connect(monkeypatch)
    try:
        body = client.post("/speak", json={"text": "hi"}).json()
    finally:
        fake.close()
    assert body["source"] == "gemini_tts:backup-tts" and body["audio_base64"]


def test_speak_falls_back_to_browser_when_every_tts_model_fails(monkeypatch):
    monkeypatch.setattr(voice, "TTS_CHAIN", ["a-tts", "b-tts"])
    fake = FakeServer(lambda p, b: (500, {"error": {"code": 500, "message": "boom", "status": "INTERNAL"}})).connect(monkeypatch)
    try:
        r = client.post("/speak", json={"text": "hi"})
    finally:
        fake.close()
    body = r.json()
    assert r.status_code == 200 and body["source"] == "browser_speech" and body["audio_base64"] is None
    assert body["tried_models"] == ["a-tts", "b-tts"] and "boom" in body["errors"][0]


def test_speak_discovers_a_working_tts_model_when_configured_ones_are_unavailable(monkeypatch):
    monkeypatch.setattr(voice, "TTS_CHAIN", ["old-tts"])
    fake = FakeServer(lambda path, body: (404, {"error": {"code": 404, "message": "not found", "status": "NOT_FOUND"}})
                      if "old-tts" in path else audio_reply(), models=["gemini-x-flash", "new-tts", "old-tts"]).connect(monkeypatch)
    try:
        first = client.post("/speak", json={"text": "hi"}).json()
        second = client.post("/speak", json={"text": "hi again"}).json()
        paths = [p for p, _ in fake.requests]
    finally:
        fake.close()
    assert first["source"] == "gemini_tts:new-tts" and second["source"] == "gemini_tts:new-tts"
    assert fake.list_calls == 1
    assert "new-tts" in paths[-1] and "old-tts" not in paths[-1]


def test_speak_audio_endpoint_returns_a_wav_file(monkeypatch):
    fake = FakeServer(lambda path, body: audio_reply()).connect(monkeypatch)
    try:
        r = client.post("/speak/audio", json={"text": "hi"})
    finally:
        fake.close()
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    assert r.headers["x-flux-source"].startswith("gemini_tts:")
    with wave.open(io.BytesIO(r.content)) as w:
        assert w.getnframes() == 480


def test_speak_audio_endpoint_falls_back_to_json_without_a_key():
    r = client.post("/speak/audio", json={"text": "hi"})
    assert r.status_code == 200 and r.json()["source"] == "browser_speech"


def test_speak_demo_page_is_served():
    r = client.get("/speak-demo")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert "speechSynthesis" in r.text and "/speak" in r.text


def test_speak_validation():
    assert client.post("/speak", json={"text": ""}).status_code == 422


# ---------- transactions / flags ----------

def post_tx(user_id="C002", **kw):
    body = {"user_id": user_id, "amount": 200, "merchant": "Chipotle", "category": "dining",
            "timestamp": "2026-11-07T12:30:00", **kw}
    r = client.post("/transactions", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def flag_ids(r):
    return [f["id"] for f in r["flags"]]


def test_normal_purchase_is_not_flagged():
    r = post_tx(amount=210)
    assert r["flagged"] is False and r["flags"] == [] and r["severity"] == "none" and r["alert_id"] is None


def test_large_amount_uses_the_users_own_history():
    amounts = [float(t["amount"]) for t in csv.DictReader(open(PNC_CSV))
               if t["customer_id"] == "C002" and t["category"] == "dining" and t["transaction_type"] == "purchase"]
    mean, std = statistics.fmean(amounts), statistics.pstdev(amounts)
    r = post_tx(amount=1300)
    assert flag_ids(r) == ["large_amount"] and r["severity"] == "medium"
    detail = r["flags"][0]["detail"]
    assert f"${mean:,.2f}" in detail and f"{1300 / mean:.1f}x" in detail and f"z-score {(1300 - mean) / std:.1f}" in detail


def test_slightly_higher_than_usual_is_not_flagged():
    assert post_tx(amount=300)["flagged"] is False


def test_new_merchant_foreign_and_odd_hour_stack_to_high_severity():
    r = post_tx(amount=40, merchant="Crypto Exchange Ltd", category="shopping", country="ro",
                timestamp="2026-11-07T03:12:00")
    assert flag_ids(r) == ["new_merchant", "foreign", "odd_hour"] and r["severity"] == "high"
    assert r["country"] == "RO" and r["alert_id"].startswith("al_")


def test_odd_hour_window_edges():
    assert flag_ids(post_tx(timestamp="2026-11-07T04:59:00")) == ["odd_hour"]
    assert post_tx(timestamp="2026-11-07T05:00:00")["flagged"] is False
    assert flag_ids(post_tx(timestamp="2026-11-07T00:00:00")) == ["odd_hour"]


def test_us_country_is_not_foreign_in_any_case():
    assert post_tx(country="us")["flagged"] is False


def test_merchant_match_ignores_case():
    assert post_tx(merchant="  CHIPOTLE ")["flagged"] is False


def test_flagged_merchant_is_not_learned_until_a_clean_transaction():
    assert flag_ids(post_tx(merchant="Shady Shop")) == ["new_merchant"]
    assert flag_ids(post_tx(merchant="Shady Shop")) == ["new_merchant"]


def test_user_without_history_uses_fixed_limit_and_learns_merchants():
    uid = client.post("/onboard", json={"name": "Sam", "age": 22, "monthly_income": 3000, "monthly_expenses": 2000,
                                        "savings": 1000}).json()["user_id"]
    big = post_tx(uid, amount=600, merchant="Some Store", category=None)
    assert flag_ids(big) == ["large_amount"] and "no spending history" in big["flags"][0]["detail"]
    assert post_tx(uid, amount=40, merchant="Corner Cafe", category=None)["flagged"] is False
    assert flag_ids(post_tx(uid, amount=40, merchant="Other Cafe", category=None)) == ["new_merchant"]
    assert post_tx(uid, amount=40, merchant="Corner Cafe", category=None)["flagged"] is False


def test_transactions_validation_and_unknown_user():
    assert client.post("/transactions", json={"user_id": "u_nope", "amount": 5, "merchant": "x"}).status_code == 404
    assert client.post("/transactions", json={"user_id": "C002", "amount": 0, "merchant": "x"}).status_code == 422
    assert client.post("/transactions", json={"user_id": "C002", "amount": 5, "merchant": "x",
                                              "timestamp": "yesterday"}).status_code == 422


def test_toyota_customer_can_post_transactions():
    assert flag_ids(post_tx("TY-C001", amount=900, merchant="Gadget Hub", category=None)) == ["large_amount"]


# ---------- alerts ----------

def test_alerts_list_newest_first_with_fallback_text_and_disclaimer():
    post_tx(amount=1300, timestamp="2026-11-06T12:00:00")
    post_tx(amount=40, merchant="Crypto Exchange Ltd", country="RO", timestamp="2026-11-07T03:12:00")
    post_tx(amount=200)
    body = client.get("/alerts/C002").json()
    assert body["count"] == 2
    first, second = body["alerts"]
    assert first["transaction"]["merchant"] == "Crypto Exchange Ltd" and second["transaction"]["amount"] == 1300
    for a in body["alerts"]:
        assert a["explanation_source"] == "fallback" and a["explanation"].endswith(llm.DISCLAIMER)
        assert a["flags"][0]["detail"] in a["explanation"]


def test_alerts_are_per_user_and_unknown_user_404():
    post_tx(amount=1300)
    assert client.get("/alerts/C003").json()["count"] == 0
    assert client.get("/alerts/u_nope").status_code == 404


def test_alert_explanation_comes_from_gemini_and_is_cached(monkeypatch):
    fake = FakeServer(lambda p, b: text_reply("That charge is way above your normal dining spend.")).connect(monkeypatch)
    try:
        post_tx(amount=1300)
        first = client.get("/alerts/C002").json()["alerts"][0]
        second = client.get("/alerts/C002").json()["alerts"][0]
        sent = fake.requests[0][1]
    finally:
        fake.close()
    assert first["explanation_source"] == "gemini" and first["explanation"].startswith("That charge is way above")
    assert first["explanation"].endswith(llm.DISCLAIMER) and second["explanation"] == first["explanation"]
    assert len(fake.requests) == 1
    assert "$1,300.00 at Chipotle" in sent["contents"][0]["parts"][0]["text"]
    assert "Do not do any math" in sent["systemInstruction"]["parts"][0]["text"]


def test_alert_explanation_falls_back_when_gemini_is_down(monkeypatch):
    fake = FakeServer(lambda p, b: (503, {"error": {"code": 503, "message": "high demand", "status": "UNAVAILABLE"}})).connect(monkeypatch)
    try:
        post_tx(amount=1300)
        a = client.get("/alerts/C002").json()["alerts"][0]
    finally:
        fake.close()
    assert a["explanation_source"] == "fallback" and "contact your bank" in a["explanation"]


def test_only_the_newest_alerts_call_gemini(monkeypatch):
    fake = FakeServer(lambda p, b: text_reply("Looks unusual.")).connect(monkeypatch)
    try:
        for day in range(1, 8):
            post_tx(amount=1300, timestamp=f"2026-11-0{day}T12:00:00")
        alerts = client.get("/alerts/C002").json()["alerts"]
        calls = len(fake.requests)
    finally:
        fake.close()
    assert calls == fraud.MAX_LLM_EXPLANATIONS
    assert [a["explanation_source"] for a in alerts] == ["gemini"] * 5 + ["fallback"] * 2


def test_alerts_explain_false_never_calls_gemini(monkeypatch):
    fake = FakeServer(lambda p, b: text_reply("x")).connect(monkeypatch)
    try:
        post_tx(amount=1300)
        a = client.get("/alerts/C002?explain=false").json()["alerts"][0]
        calls = len(fake.requests)
    finally:
        fake.close()
    assert calls == 0 and a["explanation_source"] == "fallback"


# ---------- handoff ----------

def test_handoff_for_pnc_customer_includes_alerts_and_reason():
    post_tx(amount=1300)
    r = client.post("/handoff", json={"user_id": "C002", "reason": "Wants to dispute a charge"}).json()
    assert r["who"] == "Maya, 30" and r["open_alerts"] == 1
    assert r["why"][0] == "Wants to dispute a charge" and "flagged transaction" in r["why"][-1]
    for part in ("WHO: Maya, 30 (C002)", "WHAT:", "WHY THEY NEED A PERSON:", "NEXT STEP:"):
        assert part in r["summary"]
    assert "Review the flagged transactions" in r["next_step"]


def test_handoff_for_toyota_customer_uses_guardrail_reasons():
    r = client.post("/handoff", json={"user_id": "TY-C014", "conversation": ["I missed two payments", "Flux: a specialist can help"]}).json()
    assert "Customer is marked vulnerable" in r["why"] and "2 missed payments in the last 12 months" in r["why"]
    assert "Tacoma" in r["what"] and "Contact by Phone" in r["next_step"] and "No upsell" in r["next_step"]
    assert "RECENT CHAT: I missed two payments | Flux: a specialist can help" in r["summary"]


def test_handoff_without_any_reason_still_says_why():
    r = client.post("/handoff", json={"user_id": "C001"}).json()
    assert r["why"] and r["summary"]


def test_handoff_unknown_user_404():
    assert client.post("/handoff", json={"user_id": "u_nope"}).status_code == 404
