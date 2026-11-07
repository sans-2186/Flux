"""Flux API. Run: uvicorn app.main:app --reload"""
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import llm

app = FastAPI(title="Flux API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    user_id: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    mode: str
    source: str


@app.get("/")
def root():
    return {"status": "ok", "gemini_configured": llm.get_client() is not None,
            "model": llm.GEMINI_MODEL}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        text, source = llm.explain(req.message)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini call failed: {e}")
    return ChatResponse(reply=llm.with_disclaimer(text), mode="education", source=source)
