"""Flux API. Run: uvicorn app.main:app --reload"""
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from app import agent, finance, fraud, handoff, llm, mockdata, store, toyota, voice

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
    age: int = Field(ge=13, le=100)
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
    voice: Optional[str] = None


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


def _user_or_404(user_id: str) -> dict:
    user = store.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Unknown user_id. Call POST /onboard first.")
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
def onboard(req: OnboardRequest):
    record = req.model_dump()
    record["budget"] = finance.generate_budget(record)
    user_id = store.add_user(record)
    return {"user_id": user_id, "name": req.name, "data_source": "form", "budget": record["budget"],
            "health": finance.health_indicators(record)}


@app.get("/next-move/{user_id}")
def next_move(user_id: str):
    """Toyota track, no LLM: facts, guardrails and the options this customer may be shown."""
    user = _user_or_404(user_id)
    if user.get("source") != "toyota_pack":
        raise HTTPException(status_code=400, detail="Not a Toyota demo customer. Use ids like TY-C001 (see /demo-users).")
    return toyota.next_move_options(user)


@app.get("/health/{user_id}")
def health(user_id: str):
    user = _user_or_404(user_id)
    if user.get("source") == "toyota_pack":
        raise HTTPException(status_code=400, detail="Toyota demo customers only have vehicle-finance data. "
                                                    f"Use /next-move/{user_id}.")
    return {"user_id": user_id, "name": user["name"], "data_source": user.get("source", "form"),
            "indicators": finance.health_indicators(user)}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
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


@app.post("/speak")
def speak(req: SpeakRequest):
    """Gemini TTS. Always HTTP 200. `audio_base64` is a WAV; if it is null, speak `text` with the browser's
    speechSynthesis instead (`source` = "browser_speech")."""
    return voice.speak(req.text, req.voice)


@app.post("/transactions")
def add_transaction(req: TransactionRequest):
    """Submit a card transaction. Returns the flags (large amount, new merchant, foreign, odd hour)."""
    _user_or_404(req.user_id)
    when = datetime.fromisoformat(req.timestamp.replace("Z", "+00:00")) if req.timestamp else datetime.now()
    return fraud.record_transaction(req.user_id, req.amount, req.merchant, req.category, req.country, when)


@app.get("/alerts/{user_id}")
def alerts(user_id: str, explain: bool = True):
    """Flagged transactions, newest first, each with a plain-language explanation (Gemini, else fixed text)."""
    _user_or_404(user_id)
    found = fraud.alerts_for(user_id, explain=explain)
    return {"user_id": user_id, "count": len(found), "alerts": found}


@app.post("/handoff")
def handoff_summary(req: HandoffRequest):
    """Who / what / why / next step summary for a human agent. Plain Python, no LLM."""
    return handoff.build(_user_or_404(req.user_id), req.reason, req.conversation)
