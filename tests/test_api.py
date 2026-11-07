from fastapi.testclient import TestClient

from app import llm
from app.main import app

client = TestClient(app)


def test_root():
    assert client.get("/").json()["status"] == "ok"


def test_chat_education_has_disclaimer(monkeypatch):
    monkeypatch.setattr(llm, "explain", lambda m: ("Interest is the cost of borrowing.", "gemini"))
    r = client.post("/chat", json={"message": "explain interest rates"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "education"
    assert body["reply"].endswith(llm.DISCLAIMER)


def test_chat_rejects_empty():
    assert client.post("/chat", json={"message": ""}).status_code == 422
