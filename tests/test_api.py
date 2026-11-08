import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi.testclient import TestClient

from app import llm, store
from app.main import app

client = TestClient(app)

PROFILE = {"name": "Sam", "age": 22, "monthly_income": 3000, "monthly_expenses": 2000,
           "savings": 4000, "debts": [{"name": "student loan", "balance": 12000, "monthly_payment": 200}],
           "credit_card_balance": 500, "credit_limit": 5000, "goals": ["save for a car"],
           "vehicle": {"make": "Toyota", "model": "Corolla", "year": 2019, "value": 15000,
                       "loan_balance": 11000, "monthly_payment": 300}}


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    monkeypatch.setenv("FLUX_DATA_FILE", str(tmp_path / "users.json"))
    monkeypatch.setattr(store, "_users", None)


def onboard():
    r = client.post("/onboard", json=PROFILE)
    assert r.status_code == 200
    return r.json()


def test_root():
    assert client.get("/").json()["status"] == "ok"


def test_chat_education_has_disclaimer(monkeypatch):
    monkeypatch.setattr(llm, "explain", lambda m: ("Interest is the cost of borrowing.", "gemini"))
    r = client.post("/chat", json={"message": "explain interest rates"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "education" and body["tools_used"] == []
    assert body["reply"].endswith(llm.DISCLAIMER)


def test_chat_rejects_empty():
    assert client.post("/chat", json={"message": ""}).status_code == 422


def test_onboard_returns_budget_and_health():
    body = onboard()
    assert body["user_id"].startswith("u_")
    assert body["budget"]["total"] == 3000.0
    assert len(body["health"]) == 4


def test_onboard_persists_to_json_file(tmp_path):
    uid = onboard()["user_id"]
    saved = json.loads((tmp_path / "users.json").read_text())
    assert saved[uid]["name"] == "Sam"


def test_onboard_validation():
    assert client.post("/onboard", json={**PROFILE, "monthly_income": 0}).status_code == 422
    assert client.post("/onboard", json={"name": "x"}).status_code == 422


def test_health_endpoint():
    uid = onboard()["user_id"]
    r = client.get(f"/health/{uid}")
    assert r.status_code == 200
    ind = r.json()["indicators"]
    assert {i["id"] for i in ind} >= {"savings_rate", "debt_to_income",
                                      "emergency_fund_months", "credit_utilization"}
    for i in ind:
        assert i["status"] in ("good", "ok", "risk") and i["explanation"]


def test_demo_users_listed_and_usable():
    users = client.get("/demo-users").json()
    pnc = [u for u in users if u["track"] == "pnc"]
    ty = [u for u in users if u["track"] == "toyota"]
    assert len(pnc) == 30 and pnc[0]["user_id"] == "C001"
    assert len(ty) == 20 and ty[0]["user_id"] == "TY-C001" and ty[0]["customer_says"]
    r = client.get("/health/C001").json()
    assert r["data_source"] == "pnc_mock" and len(r["indicators"]) == 4


def test_chat_on_mock_customer_falls_back_with_real_numbers(monkeypatch):
    monkeypatch.setattr(llm, "run_chain", lambda *a, **k: None)
    r = client.post("/chat", json={"message": "how am I doing?", "user_id": "C002"}).json()
    assert r["mode"] == "coach" and "Savings rate" in r["reply"]


def test_health_unknown_user_404():
    assert client.get("/health/u_nope").status_code == 404


def test_chat_unknown_user_404():
    assert client.post("/chat", json={"message": "hi", "user_id": "u_nope"}).status_code == 404


def test_chat_coach_falls_back_to_health_snapshot_without_gemini(monkeypatch):
    monkeypatch.setattr(llm, "run_chain", lambda *a, **k: None)
    uid = onboard()["user_id"]
    r = client.post("/chat", json={"message": "can I buy a bag?", "user_id": uid}).json()
    assert r["mode"] == "coach" and r["source"] == "fallback_health"
    assert "Savings rate" in r["reply"] and r["reply"].endswith(llm.DISCLAIMER)


class FakeGemini(BaseHTTPRequestHandler):
    """Speaks Gemini's REST format. Turn 1: ask to call a tool. Turn 2: answer from the tool result."""
    seen = []
    call = {"name": "can_afford", "args": {"price": 300}}

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeGemini.seen.append(body)
        responses = [p["functionResponse"] for c in body["contents"] for p in c.get("parts", [])
                     if "functionResponse" in p]
        if responses:
            result = responses[0]["response"]["result"]
            part = {"text": "TOOL_KEYS=" + ",".join(sorted(result))}
        else:
            part = {"functionCall": dict(FakeGemini.call)}
        payload = {"candidates": [{"content": {"role": "model", "parts": [part]}, "finishReason": "STOP"}]}
        data = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


def run_fake_gemini(monkeypatch, user_id, message, call):
    """Run /chat through the real google-genai SDK against a fake local Gemini server."""
    from google import genai
    from google.genai import types

    server = HTTPServer(("127.0.0.1", 0), FakeGemini)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        monkeypatch.setenv("GEMINI_API_KEY", "fake")
        monkeypatch.setattr(llm, "_client", genai.Client(
            api_key="fake",
            http_options=types.HttpOptions(base_url=f"http://127.0.0.1:{server.server_port}")))
        FakeGemini.seen.clear()
        FakeGemini.call = call
        return client.post("/chat", json={"message": message, "user_id": user_id}).json()
    finally:
        server.shutdown()


def declared_tools():
    return {d["name"] for t in FakeGemini.seen[0]["tools"] for d in t["functionDeclarations"]}


def test_chat_coach_runs_real_function_calling_loop(monkeypatch):
    """End to end through the google-genai SDK against a fake Gemini server (no API key needed)."""
    uid = onboard()["user_id"]
    r = run_fake_gemini(monkeypatch, uid, "can I buy a $300 bag?",
                        {"name": "can_afford", "args": {"price": 300}})
    assert r["source"] == "gemini" and r["mode"] == "coach"
    assert r["tools_used"] == ["can_afford"]
    assert "affordable" in r["reply"] and "monthly_surplus" in r["reply"]
    assert declared_tools() == {"can_afford", "retirement_check", "forecast_balances", "what_if",
                                "trade_in_check", "spending_breakdown", "health_check"}


def test_toyota_chat_runs_function_calling_with_toyota_tools(monkeypatch):
    r = run_fake_gemini(monkeypatch, "TY-C001", "Am I overpaying?",
                        {"name": "next_move_options", "args": {}})
    assert r["source"] == "gemini" and r["tools_used"] == ["next_move_options"]
    assert "guardrails" in r["reply"] and "options" in r["reply"]
    assert declared_tools() == {"next_move_options", "trade_in_check"}


def test_retirement_tool_args_reach_python_through_sdk(monkeypatch):
    r = run_fake_gemini(monkeypatch, "C002", "can I retire at 50 on 90k?",
                        {"name": "retirement_check", "args": {"target_age": 50, "annual_income": 90000}})
    assert r["tools_used"] == ["retirement_check"] and "needed_balance" in r["reply"]


def test_toyota_endpoints_and_guards():
    r = client.get("/next-move/TY-C014").json()
    assert r["guardrails"]["must_offer_human"] is True
    assert not any(o["option_id"] in ("REFI", "TRADE", "EXTEND") for o in r["options"])
    assert client.get("/next-move/C001").status_code == 400
    assert client.get("/next-move/TY-C999").status_code == 404
    assert client.get("/health/TY-C001").status_code == 400


def test_toyota_chat_falls_back_to_data_summary_without_gemini(monkeypatch):
    monkeypatch.setattr(llm, "run_chain", lambda *a, **k: None)
    r = client.post("/chat", json={"message": "what should I do?", "user_id": "TY-C001"}).json()
    assert r["mode"] == "coach" and r["source"] == "fallback_health"
    assert "Refinance" in r["reply"] and r["reply"].endswith(llm.DISCLAIMER)
