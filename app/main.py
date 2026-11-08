"""Flux API. Run: uvicorn app.main:app --reload"""
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import agent, finance, llm, mockdata, store

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
    """The 30 PNC mock customers. Use their user_id (C001..C030) in /health and /chat."""
    return mockdata.list_users()


@app.post("/onboard")
def onboard(req: OnboardRequest):
    record = req.model_dump()
    record["budget"] = finance.generate_budget(record)
    user_id = store.add_user(record)
    return {"user_id": user_id, "name": req.name, "data_source": "form", "budget": record["budget"],
            "health": finance.health_indicators(record)}


@app.get("/health/{user_id}")
def health(user_id: str):
    user = _user_or_404(user_id)
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
