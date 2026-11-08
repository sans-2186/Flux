"""Match onboarding choices to a PNC demo customer and seed alert demos."""
from fastapi.testclient import TestClient

from app import fraud, matchdemo
from app.main import app

client = TestClient(app)


def setup_function():
    fraud.reset()


def test_car_goal_prefers_vehicle_customer():
    m = matchdemo.match_customer(
        goals=["Buy my first car", "Save for a purchase"],
        monthly_income=3200,
        monthly_debt_payments=200,
        understanding_focus="affordability",
    )
    assert m["user_id"].startswith("C")
    assert m["has_vehicle"] is True or "car" in " ".join(m["goals"]).lower()


def test_debt_focus_leans_toward_debt_heavy_customer():
    m = matchdemo.match_customer(
        goals=["Pay down debt"],
        monthly_income=4200,
        monthly_debt_payments=500,
        understanding_focus="debt",
    )
    assert m["user_id"].startswith("C")
    assert m["score"] > 0


def test_demo_pack_seeds_two_alerts_idempotently():
    r = client.post(
        "/demo-pack",
        json={
            "goals": ["Build an emergency fund"],
            "monthly_income": 6000,
            "monthly_debt_payments": 250,
            "understanding_focus": "saving",
            "explain": False,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["matched_user_id"].startswith("C")
    assert body["count"] == 2
    severities = {a["severity"] for a in body["alerts"]}
    assert "high" in severities
    assert any(a["transaction"]["merchant"] == "Crypto Exchange Ltd" for a in body["alerts"])

    again = client.post(
        "/demo-pack",
        json={
            "goals": ["Build an emergency fund"],
            "monthly_income": 6000,
            "monthly_debt_payments": 250,
            "understanding_focus": "saving",
            "explain": False,
        },
    ).json()
    assert again["count"] == 2
    assert again["matched_user_id"] == body["matched_user_id"]


def test_alerts_endpoint_lists_seeded_pack():
    pack = client.post(
        "/demo-pack",
        json={"goals": ["Pay down debt"], "monthly_income": 5000, "explain": False},
    ).json()
    listed = client.get(f"/alerts/{pack['matched_user_id']}?explain=false").json()
    assert listed["count"] == 2
