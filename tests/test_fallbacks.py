from app import demo_fallbacks, llm


def test_ira_canned():
    assert "retirement" in demo_fallbacks.lookup("what is an IRA?").lower()


def test_explain_uses_canned_when_all_models_fail(monkeypatch):
    class Boom(Exception):
        def __str__(self):
            return "503 UNAVAILABLE high demand"

    def fake_call(*_a, **_k):
        raise Boom()

    monkeypatch.setattr(llm, "get_client", lambda: object())
    monkeypatch.setattr(llm, "_call_gemini", fake_call)
    text, source = llm.explain("what is an IRA?")
    assert source == "fallback_canned"
    assert "IRA" in text or "retirement" in text.lower()
