"""Gemini wrapper. The LLM only explains; all math lives in wellness/ and app tools."""
import os

from dotenv import load_dotenv

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


def explain(message):
    """Phase 1 education answer. Returns (text, source) where source is 'gemini' or 'mock'."""
    client = get_client()
    if client is None:
        return (f"(Mock reply: set GEMINI_API_KEY in .env for real answers.) "
                f"You asked: \"{message}\".", "mock")
    from google.genai import types
    resp = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=message,
        config=types.GenerateContentConfig(system_instruction=EDUCATION_PROMPT, temperature=0.4),
    )
    return (resp.text or "").strip(), "gemini"
