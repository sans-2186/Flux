"""Gemini wrapper. The LLM only explains; all math lives in wellness/ and app tools."""
from __future__ import annotations

import os
import time

from dotenv import load_dotenv

from app import demo_fallbacks

load_dotenv()

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
DISCLAIMER = "Not financial advice - just education to help you decide."

EDUCATION_PROMPT = (
    "You are Flux, a friendly voice-first money coach for Gen Z. "
    "Explain the user's money question in plain, casual language in 3 to 5 short sentences. "
    "Use one simple everyday example if it helps. No markdown, no bullet lists, no emojis, "
    "because your answer is read aloud. Do not do calculations with specific numbers about "
    "the user's own finances; if they ask about their personal situation, explain the concept "
    "and suggest they set up their profile so Flux can run the numbers. "
    "Do not add a disclaimer; the app adds one."
)

_client = None


def _parse_fallback_models() -> list[str]:
    raw = os.getenv("GEMINI_MODEL_FALLBACKS", "gemini-3.5-flash-lite,gemini-3.1-flash-lite")
    extra = [m.strip() for m in raw.split(",") if m.strip()]
    seen: set[str] = set()
    out: list[str] = []
    for m in [GEMINI_MODEL, *extra]:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


MODEL_CHAIN = _parse_fallback_models()

_client = None


def get_client():
    """Return a cached Gemini client, or None when GEMINI_API_KEY is not set."""
    global _client
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=key)
    return _client


def with_disclaimer(text):
    text = text.strip()
    return text if DISCLAIMER in text else f"{text}\n\n{DISCLAIMER}"


def _retryable(exc: BaseException) -> bool:
    s = str(exc).upper()
    return any(x in s for x in ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "HIGH DEMAND"))


def _call_gemini(client, model: str, message: str) -> str:
    from google.genai import types
    resp = client.models.generate_content(
        model=model,
        contents=message,
        config=types.GenerateContentConfig(system_instruction=EDUCATION_PROMPT, temperature=0.4),
    )
    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("empty Gemini response")
    return text


def _offline_answer(message: str) -> tuple[str, str]:
    canned = demo_fallbacks.lookup(message)
    if canned:
        return canned, "fallback_canned"
    return demo_fallbacks.GENERIC_BUSY, "fallback_generic"


def explain(message):
    """
    Phase 1 education answer.
    Returns (text, source): gemini | mock | fallback_canned | fallback_generic
    """
    client = get_client()
    if client is None:
        text, source = _offline_answer(message)
        if source == "fallback_canned":
            return text, source
        return (
            f"(Mock reply: set GEMINI_API_KEY in .env for real answers.) "
            f"You asked: \"{message}\".",
            "mock",
        )

    errors: list[str] = []
    for model in MODEL_CHAIN:
        for attempt in range(3):
            try:
                text = _call_gemini(client, model, message)
                source = "gemini" if model == MODEL_CHAIN[0] else f"gemini:{model}"
                return text, source
            except Exception as e:
                errors.append(f"{model}#{attempt + 1}: {e}")
                if _retryable(e) and attempt < 2:
                    time.sleep(0.4 * (attempt + 1))
                    continue
                if _retryable(e):
                    break
                raise

    text, source = _offline_answer(message)
    return text, source
