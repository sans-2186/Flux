"""Pick the closest PNC mock customer (C001..C030) for transaction/alert demos.

The matched id is ONLY for spending history + suspicious-transaction flags.
The form user's income/rent/savings (and the coach tools) stay on the onboarded
`u_*` record — this module never overwrites those.
"""
from __future__ import annotations

import re

from app import mockdata

# Map UI onboarding labels → tokens that appear in mock/people.json goals.
_GOAL_TOKENS = {
    "build an emergency fund": {"emergency", "fund"},
    "pay down debt": {"debt", "loan", "credit", "card", "student"},
    "save for a purchase": {"car", "house", "down", "purchase", "travel", "fund"},
    "buy my first car": {"car"},
    "improve monthly cash flow": {"cash", "investing", "emergency"},
    "travel": {"travel"},
    "invest": {"investing"},
}


def _tokens(*parts: str) -> set[str]:
    words: set[str] = set()
    for part in parts:
        for piece in re.split(r"[^a-z0-9]+", (part or "").lower()):
            if len(piece) >= 3:
                words.add(piece)
    return words


def _goal_score(ui_goals: list[str], demo_goals: list[str]) -> float:
    demo_tok = _tokens(*demo_goals)
    if not ui_goals:
        return 0.0
    score = 0.0
    for g in ui_goals:
        key = g.strip().lower()
        wanted = _GOAL_TOKENS.get(key) or _tokens(key)
        if not wanted:
            continue
        overlap = len(wanted & demo_tok)
        if overlap:
            score += overlap
        # Soft substring hits (e.g. "car" inside "buy a car")
        blob = " ".join(demo_goals).lower()
        score += sum(1 for w in wanted if w in blob) * 0.25
    return score


def match_customer(
    goals: list[str] | None = None,
    monthly_income: float = 0.0,
    monthly_debt_payments: float = 0.0,
    understanding_focus: str | None = None,
) -> dict:
    """Return {user_id, name, score, reason, goals, monthly_income, has_vehicle}."""
    goals = [g for g in (goals or []) if g and g.lower() not in ("no specific goal", "something else")]
    focus = (understanding_focus or "").lower()
    wants_car = any("car" in g.lower() or "purchase" in g.lower() for g in goals)
    cares_debt = focus == "debt" or any("debt" in g.lower() for g in goals)
    cares_save = focus == "saving" or any("emergency" in g.lower() or "save" in g.lower() for g in goals)

    best = None
    for u in mockdata.all_users().values():
        if u.get("source") and u["source"] != "pnc_mock":
            continue
        score = 0.0
        reasons = []

        gscore = _goal_score(goals, u.get("goals") or [])
        if gscore:
            score += gscore * 3
            reasons.append(" overlapping goals")

        demo_income = float(u["monthly_income"] or 0)
        if monthly_income > 0 and demo_income > 0:
            # Closer incomes score higher (cap contribution).
            ratio = max(monthly_income, demo_income) / max(min(monthly_income, demo_income), 1)
            proximity = max(0.0, 4.0 - abs(ratio - 1.0) * 4.0)
            score += proximity
            if proximity >= 2.5:
                reasons.append(" similar income")

        demo_debt = sum(d.get("monthly_payment", 0) for d in u.get("debts") or [])
        demo_debt += float(u.get("credit_card_payment") or 0)
        if cares_debt and demo_debt >= 400:
            score += 2.0
            reasons.append(" active debt load")
        if monthly_debt_payments > 0 and demo_debt > 0:
            debt_ratio = max(monthly_debt_payments, demo_debt) / max(
                min(monthly_debt_payments, demo_debt), 1
            )
            if debt_ratio < 2.5:
                score += 1.0

        if wants_car and u.get("vehicle"):
            score += 2.5
            reasons.append(" has a vehicle on file")
        if cares_save and any("emergency" in g.lower() for g in u.get("goals") or []):
            score += 1.5
            reasons.append(" emergency-fund goal")

        # Stable tie-break: prefer mid-list demo customers used in docs (C002) slightly.
        if u["user_id"] == "C002":
            score += 0.05

        candidate = {
            "user_id": u["user_id"],
            "name": u["name"],
            "score": round(score, 3),
            "goals": u.get("goals") or [],
            "monthly_income": u["monthly_income"],
            "has_vehicle": u.get("vehicle") is not None,
            "reason": "",
        }
        if best is None or candidate["score"] > best["score"]:
            best = candidate
            detail = ",".join(reasons) if reasons else " balanced profile fit"
            best["reason"] = f"Closest PNC demo customer to your onboarding choices:{detail}."

    if best is None:
        # Should not happen with the bundled mock pack.
        return {
            "user_id": "C002",
            "name": "Maya",
            "score": 0.0,
            "reason": "Default demo customer (Maya).",
            "goals": ["build an emergency fund"],
            "monthly_income": 0,
            "has_vehicle": True,
        }
    return best
