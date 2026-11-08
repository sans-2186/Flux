"""Text-to-speech via Gemini TTS. Never raises: on any failure the caller gets a browser-speech fallback."""
import base64
import io
import logging
import os
import re
import time
import wave

from app import llm

log = logging.getLogger("flux.voice")

TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
TTS_FALLBACKS = [m.strip() for m in os.getenv("GEMINI_TTS_MODEL_FALLBACKS", "gemini-3.1-flash-tts-preview").split(",")
                 if m.strip()]
TTS_CHAIN = [TTS_MODEL] + [m for m in TTS_FALLBACKS if m != TTS_MODEL]
DEFAULT_VOICE = os.getenv("GEMINI_TTS_VOICE", "Kore")
DEFAULT_RATE = 24000  # Gemini TTS returns 16-bit mono PCM at 24 kHz


def clean_for_speech(text: str) -> str:
    """Drop markdown symbols so the voice does not read 'asterisk asterisk'."""
    text = re.sub(r"[*_`#>]+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _rate_from_mime(mime: str) -> int:
    m = re.search(r"rate=(\d+)", mime or "")
    return int(m.group(1)) if m else DEFAULT_RATE


def pcm_to_wav(pcm: bytes, rate: int = DEFAULT_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def _tts_once(client, model: str, text: str, voice: str):
    from google.genai import types
    resp = client.models.generate_content(
        model=model,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice))),
        ),
    )
    inline = resp.candidates[0].content.parts[0].inline_data
    if inline is None or not inline.data:
        raise RuntimeError("no audio in Gemini TTS response")
    return inline.data, inline.mime_type or ""


def speak(text: str, voice: str = None) -> dict:
    """Returns {audio_base64, mime_type, source, ...}. audio_base64 is None when the frontend should
    use the browser's speech synthesis instead (source = "browser_speech")."""
    spoken = clean_for_speech(text)
    fallback = {"audio_base64": None, "mime_type": None, "source": "browser_speech", "text": spoken}
    client = llm.get_client()
    if client is None:
        return {**fallback, "reason": "no GEMINI_API_KEY configured"}
    for model in TTS_CHAIN:
        for attempt in range(2):
            try:
                pcm, mime = _tts_once(client, model, spoken, voice or DEFAULT_VOICE)
                wav = pcm_to_wav(pcm, _rate_from_mime(mime))
                return {"audio_base64": base64.b64encode(wav).decode(), "mime_type": "audio/wav",
                        "source": f"gemini_tts:{model}", "text": spoken}
            except Exception as e:
                log.warning("Gemini TTS %s attempt %d failed: %s", model, attempt + 1, e)
                if llm._retryable(e) and attempt < 1:
                    time.sleep(0.25)
                    continue
                break
    return {**fallback, "reason": "Gemini TTS unavailable"}
