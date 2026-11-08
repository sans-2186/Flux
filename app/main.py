"""Flux API. Run: uvicorn app.main:app --reload"""
import base64
from datetime import datetime
from pathlib import Path as FilePath
from typing import List, Optional

from fastapi import Body, FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field, field_validator

from app import agent, companion, finance, fraud, handoff, llm, matchdemo, mockdata, store, toyota, voice

app = FastAPI(title="Flux API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    user_id: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    mode: str
    source: str
    tools_used: List[str] = []


class Debt(BaseModel):
    name: str = "debt"
    balance: float = Field(ge=0)
    monthly_payment: float = Field(ge=0)


class Vehicle(BaseModel):
    make: str
    model: str
    year: int = Field(ge=1980, le=2100)
    value: float = Field(ge=0)
    loan_balance: float = Field(ge=0)
    monthly_payment: float = Field(ge=0)


class OnboardRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    age: Optional[int] = Field(default=None, ge=13, le=100)
    monthly_income: float = Field(gt=0)
    monthly_expenses: float = Field(ge=0)
    savings: float = Field(ge=0)
    debts: List[Debt] = []
    credit_card_balance: float = Field(default=0, ge=0)
    credit_limit: float = Field(default=0, ge=0)
    credit_card_payment: float = Field(default=0, ge=0)
    goals: List[str] = []
    vehicle: Optional[Vehicle] = None


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: Optional[str] = Field(default=None, description="Optional Gemini voice name, e.g. Kore (default), Puck, "
                                 "Charon, Aoede, Zephyr, Fenrir, Leda, Orus. Leave out to use the default.")


class TranscribeRequest(BaseModel):
    audio_base64: str = Field(min_length=8)
    mime_type: str = Field(default="audio/wav", max_length=80)


class TransactionRequest(BaseModel):
    user_id: str
    amount: float = Field(gt=0)
    merchant: str = Field(min_length=1, max_length=120)
    category: Optional[str] = None
    country: str = Field(default="US", min_length=2, max_length=3)
    timestamp: Optional[str] = Field(default=None, description="ISO time, e.g. 2026-11-07T03:12:00. Default: now.")

    @field_validator("timestamp")
    @classmethod
    def _valid_time(cls, v):
        if v is not None:
            datetime.fromisoformat(v.replace("Z", "+00:00"))
        return v


class HandoffRequest(BaseModel):
    user_id: str
    reason: Optional[str] = Field(default=None, max_length=500)
    conversation: List[str] = []


class DemoPackRequest(BaseModel):
    """Match onboarding choices to a PNC demo customer and seed suspicious-transaction alerts.

    Does not change the form / coach user — only picks a ledger identity for notifications.
    """
    goals: List[str] = []
    monthly_income: float = Field(default=0, ge=0)
    monthly_debt_payments: float = Field(default=0, ge=0)
    understanding_focus: Optional[str] = None
    explain: bool = Field(default=False, description="Ask Gemini to rewrite alert copy (slower).")


USER_ID_EXAMPLES = {
    "pnc": {"summary": "PNC customer (Maya)", "value": "C002"},
    "toyota": {"summary": "Toyota customer (Kevin, hardship)", "value": "TY-C014"},
}
PATH_USER = Path(openapi_examples=USER_ID_EXAMPLES)

CHAT_EXAMPLES = {
    "education": {"summary": "Education (no user)", "value": {"message": "what is an IRA?"}},
    "afford": {"summary": "Can I afford it? (C002)", "value": {"message": "can I buy a $300 bag?", "user_id": "C002"}},
    "retire": {"summary": "Retirement (C002)", "value": {"message": "can I retire at 50 on 90k?", "user_id": "C002"}},
    "trade_in": {"summary": "Trade-in (C008)", "value": {"message": "should I trade in my car?", "user_id": "C008"}},
    "spending": {"summary": "Spending breakdown (C002)", "value": {"message": "where is my money going?", "user_id": "C002"}},
    "toyota": {"summary": "Toyota hardship (TY-C014)", "value": {"message": "I missed two payments, what now?", "user_id": "TY-C014"}},
    "toyota_refi": {"summary": "Toyota refinance (TY-C001)", "value": {"message": "Am I overpaying on my loan?", "user_id": "TY-C001"}},
}
TX_EXAMPLES = {
    "normal": {"summary": "Normal purchase (not flagged)", "value": {
        "user_id": "C002", "amount": 200, "merchant": "Chipotle", "category": "dining", "timestamp": "2026-11-07T12:30:00"}},
    "large": {"summary": "Large purchase (medium)", "value": {
        "user_id": "C002", "amount": 1300, "merchant": "Chipotle", "category": "dining", "timestamp": "2026-11-07T12:30:00"}},
    "risky": {"summary": "New merchant + abroad + 3 AM (high)", "value": {
        "user_id": "C002", "amount": 40, "merchant": "Crypto Exchange Ltd", "category": "shopping",
        "country": "RO", "timestamp": "2026-11-07T03:12:00"}},
}
HANDOFF_EXAMPLES = {
    "toyota": {"summary": "Toyota hardship customer", "value": {"user_id": "TY-C014"}},
    "pnc": {"summary": "PNC customer with a reason", "value": {"user_id": "C002", "reason": "Wants to dispute a charge"}},
}
SPEAK_EXAMPLES = {
    "default": {"summary": "Default voice (Kore)", "value": {"text": "Hi Maya, you are on track."}},
    "puck": {"summary": "Voice: Puck (upbeat)", "value": {"text": "Hi Maya, you are on track.", "voice": "Puck"}},
    "charon": {"summary": "Voice: Charon (informative)", "value": {"text": "Hi Maya, you are on track.", "voice": "Charon"}},
    "aoede": {"summary": "Voice: Aoede (breezy)", "value": {"text": "Hi Maya, you are on track.", "voice": "Aoede"}},
}
ONBOARD_EXAMPLES = {"sam": {"summary": "Sam", "value": {
    "name": "Sam", "age": 22, "monthly_income": 3200, "monthly_expenses": 2100, "savings": 3500,
    "debts": [{"name": "student loan", "balance": 14000, "monthly_payment": 180}],
    "credit_card_balance": 900, "credit_limit": 3000, "goals": ["buy a car"]}}}


def _user_or_404(user_id: str) -> dict:
    user = store.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"Unknown user_id '{user_id}'. Use C001-C030 or TY-C001-TY-C020 "
                                                    "(see /demo-users), or an id returned by POST /onboard.")
    return user


@app.get("/")
def root():
    return {
        "status": "ok",
        "gemini_configured": llm.get_client() is not None,
        "model": llm.GEMINI_MODEL,
        "model_fallbacks": llm.MODEL_CHAIN,
    }


@app.get("/demo-users")
def demo_users():
    """Demo customers. track=pnc: C001..C030 (financial health). track=toyota: TY-C001..TY-C020
    (vehicle finance). Use the user_id in /chat; /health is for pnc, /next-move is for toyota."""
    return ([{**u, "track": "pnc"} for u in mockdata.list_users()]
            + [{**u, "track": "toyota"} for u in toyota.list_users()])


@app.post("/onboard")
def onboard(req: OnboardRequest = Body(openapi_examples=ONBOARD_EXAMPLES)):
    record = req.model_dump()
    record["budget"] = finance.generate_budget(record)
    user_id = store.add_user(record)
    return {"user_id": user_id, "name": req.name, "data_source": "form", "budget": record["budget"],
            "health": finance.health_indicators(record)}


@app.get("/next-move/{user_id}")
def next_move(user_id: str = Path(openapi_examples={"toyota": {"summary": "Toyota customer", "value": "TY-C001"}})):
    """Toyota track, no LLM: facts, guardrails and the options this customer may be shown."""
    user = _user_or_404(user_id)
    if user.get("source") != "toyota_pack":
        raise HTTPException(status_code=400, detail="Not a Toyota demo customer. Use ids like TY-C001 (see /demo-users).")
    return toyota.next_move_options(user)


@app.get("/health/{user_id}")
def health(user_id: str = Path(openapi_examples={"pnc": {"summary": "PNC customer", "value": "C002"}})):
    user = _user_or_404(user_id)
    if user.get("source") == "toyota_pack":
        raise HTTPException(status_code=400, detail="Toyota demo customers only have vehicle-finance data. "
                                                    f"Use /next-move/{user_id}.")
    return {"user_id": user_id, "name": user["name"], "data_source": user.get("source", "form"),
            "indicators": finance.health_indicators(user)}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest = Body(openapi_examples=CHAT_EXAMPLES)):
    if req.user_id:
        user = _user_or_404(req.user_id)
        text, source, tools = agent.coach_reply(user, req.message)
        return ChatResponse(reply=llm.with_disclaimer(text), mode="coach", source=source,
                            tools_used=tools)
    try:
        text, source = llm.explain(req.message)
    except Exception:
        # Presentation-safe: HTTP 200 + canned education copy instead of 502
        text, source = llm._offline_answer(req.message)
    return ChatResponse(reply=llm.with_disclaimer(text), mode="education", source=source)


@app.post("/transcribe")
def transcribe(req: TranscribeRequest):
    """Speech-to-text for the Flux AI mic. Always HTTP 200; `transcript` is null if nothing was heard."""
    return voice.transcribe(req.audio_base64, req.mime_type)


@app.post("/companion-session")
def save_companion_session(payload: dict = Body(...)):
    """Store the compare-path snapshot the Chrome companion popup reads on a Toyota listing."""
    return companion.save(payload)


@app.get("/companion-session")
def get_companion_session():
    data = companion.load()
    if data is None:
        raise HTTPException(status_code=404, detail="No companion session yet. Open a compare path in Flux first.")
    return data


@app.post("/speak")
def speak(req: SpeakRequest = Body(openapi_examples=SPEAK_EXAMPLES)):
    """Gemini TTS. Always HTTP 200. `audio_base64` is a WAV; if it is null, speak `text` with the browser's
    speechSynthesis instead (`source` = "browser_speech")."""
    return voice.speak(req.text, req.voice)


@app.post("/transactions")
def add_transaction(req: TransactionRequest = Body(openapi_examples=TX_EXAMPLES)):
    """Submit a card transaction. Returns the flags (large amount, new merchant, foreign, odd hour)."""
    _user_or_404(req.user_id)
    when = datetime.fromisoformat(req.timestamp.replace("Z", "+00:00")) if req.timestamp else datetime.now()
    return fraud.record_transaction(req.user_id, req.amount, req.merchant, req.category, req.country, when)


@app.get("/alerts/{user_id}")
def alerts(user_id: str = PATH_USER, explain: bool = True):
    """Flagged transactions, newest first, each with a plain-language explanation (Gemini, else fixed text)."""
    _user_or_404(user_id)
    found = fraud.alerts_for(user_id, explain=explain)
    return {"user_id": user_id, "count": len(found), "alerts": found}


@app.post("/demo-pack")
def demo_pack(req: DemoPackRequest = Body(openapi_examples={
    "car_saver": {"summary": "Car / purchase goal", "value": {
        "goals": ["Save for a purchase", "Buy my first car"], "monthly_income": 3200,
        "monthly_debt_payments": 250, "understanding_focus": "affordability"}},
    "debt_focus": {"summary": "Debt focus", "value": {
        "goals": ["Pay down debt"], "monthly_income": 4200,
        "monthly_debt_payments": 500, "understanding_focus": "debt"}},
})):
    """Pick the closest C001–C030 customer to the UI onboarding choices, seed 2 suspicious
    transactions against their spending history, and return the alerts for the notification bell.

    Coach chat must keep using the form `u_*` user from `/onboard` — this pack is alerts-only.
    """
    matched = matchdemo.match_customer(
        goals=req.goals,
        monthly_income=req.monthly_income,
        monthly_debt_payments=req.monthly_debt_payments,
        understanding_focus=req.understanding_focus,
    )
    _user_or_404(matched["user_id"])
    found = fraud.seed_suspicious_demo(matched["user_id"], explain=req.explain)
    return {
        "matched_user_id": matched["user_id"],
        "name": matched["name"],
        "match_reason": matched["reason"],
        "match_score": matched["score"],
        "demo_goals": matched["goals"],
        "has_vehicle": matched["has_vehicle"],
        "count": len(found),
        "alerts": found,
    }


@app.post("/handoff")
def handoff_summary(req: HandoffRequest = Body(openapi_examples=HANDOFF_EXAMPLES)):
    """Who / what / why / next step summary for a human agent. Plain Python, no LLM."""
    return handoff.build(_user_or_404(req.user_id), req.reason, req.conversation)


@app.post("/speak/audio", response_class=Response, responses={200: {"content": {"audio/wav": {}}}})
def speak_audio(req: SpeakRequest = Body(openapi_examples=SPEAK_EXAMPLES)):
    """Same as /speak but the response IS the audio file (audio/wav, saved as flux-voice.wav). If Gemini TTS
    is unavailable this returns HTTP 503 with the reason (use /speak for the browser-speech fallback)."""
    result = voice.speak(req.text, req.voice)
    if not result["audio_base64"]:
        raise HTTPException(status_code=503, detail={"reason": result.get("reason"), "errors": result.get("errors"),
                                                     "tried_models": result.get("tried_models")})
    return Response(content=base64.b64decode(result["audio_base64"]), media_type="audio/wav",
                    headers={"X-Flux-Source": result["source"],
                             "Content-Disposition": 'attachment; filename="flux-voice.wav"'})


@app.get("/speak-demo", response_class=HTMLResponse, include_in_schema=False)
def speak_demo():
    """A tiny page with a Speak button: plays Gemini TTS audio, or falls back to the browser's voice."""
    return (FilePath(__file__).parent / "speak_demo.html").read_text(encoding="utf-8")
