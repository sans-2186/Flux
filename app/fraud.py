"""Phase 3: flag unusual transactions and explain them. All detection is plain Python.

Rules (each returns a short factual `detail`):
  large_amount  amount is >= 1.5x the user's usual purchase in that category AND z-score >= 3 (history),
                or >= $500 when the user has no history (fixed policy limit)
  new_merchant  merchant not seen before for this user (skipped while Flux knows no merchants for them)
  foreign       country is not the home country (US)
  odd_hour      between 12:00 AM and 4:59 AM
Gemini only rewrites the flags into plain language (see explain_alert); it never decides or does math.
"""
import csv
import json
import statistics
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from app import llm

MOCK = Path(__file__).resolve().parent.parent / "mock"
HOME_COUNTRY = "US"
MIN_HISTORY = 6
Z_LIMIT = 3.0
MULTIPLE_LIMIT = 1.5
NO_HISTORY_LIMIT = 500.0
ODD_HOURS = range(0, 5)
WEIGHTS = {"large_amount": 2, "foreign": 2, "new_merchant": 1, "odd_hour": 1}
MAX_LLM_EXPLANATIONS = 5

ALERT_PROMPT = (
    "You are Flux, a friendly money coach for Gen Z. A card transaction was flagged. In ONE sentence of at "
    "most 20 words, say why it looks unusual and tell them to check it. Use ONLY the facts given. "
    "No math, no numbers, no markdown. Do not say it is definitely fraud."
)

SHORT_REASON = {
    "large_amount": "much bigger than usual",
    "new_merchant": "a merchant you have not used",
    "foreign": "charged outside the US",
    "odd_hour": "made in the middle of the night",
}

_history_cache = None
_alerts = []
_learned = defaultdict(set)
_seeded_demo = set()


def reset():
    _alerts.clear()
    _learned.clear()
    _seeded_demo.clear()


def _history():
    """{customer_id: {category: [amounts]}} from PNC purchases, with a pooled "_all" list."""
    global _history_cache
    if _history_cache is None:
        hist = defaultdict(lambda: defaultdict(list))
        with open(MOCK / "pnc" / "transactions.csv", newline="", encoding="utf-8") as f:
            for t in csv.DictReader(f):
                if t["flow_class"] == "expense" and t["transaction_type"] == "purchase":
                    amt = float(t["amount"])
                    hist[t["customer_id"]][t["category"]].append(amt)
                    hist[t["customer_id"]]["_all"].append(amt)
        _history_cache = hist
    return _history_cache


def _seed_merchants(user_id: str) -> set:
    cats = _history().get(user_id, {})
    merchants = json.loads((MOCK / "merchants.json").read_text(encoding="utf-8"))
    return {m.lower() for c, names in merchants.items() if c in cats for m in names}


def _money(x: float) -> str:
    return f"${x:,.2f}"


def _large_amount(user_id, amount, category):
    hist = _history().get(user_id, {})
    amounts = hist.get(category) if category else None
    label = f"your usual {category} purchase" if amounts and len(amounts) >= MIN_HISTORY else "your usual purchase"
    if not amounts or len(amounts) < MIN_HISTORY:
        amounts = hist.get("_all", [])
    if len(amounts) >= MIN_HISTORY:
        mean = statistics.fmean(amounts)
        std = statistics.pstdev(amounts)
        z = (amount - mean) / std if std > 0 else None
        if amount >= MULTIPLE_LIMIT * mean and (z is None or z >= Z_LIMIT):
            zt = f", z-score {z:.1f}" if z is not None else ""
            return {"id": "large_amount",
                    "detail": f"{_money(amount)} is {amount / mean:.1f}x {label} of {_money(mean)}{zt}."}
        return None
    if amount >= NO_HISTORY_LIMIT:
        return {"id": "large_amount", "detail": f"{_money(amount)} is over the {_money(NO_HISTORY_LIMIT)} limit "
                                                "Flux uses when it has no spending history for you."}
    return None


def evaluate(user_id: str, amount: float, merchant: str, category, country: str, when: datetime) -> list:
    flags = []
    large = _large_amount(user_id, amount, category)
    if large:
        flags.append(large)
    known = _seed_merchants(user_id) | _learned[user_id]
    if known and merchant.strip().lower() not in known:
        flags.append({"id": "new_merchant", "detail": f"{merchant} is a merchant Flux has not seen on your account before."})
    if country.strip().upper() != HOME_COUNTRY:
        flags.append({"id": "foreign", "detail": f"Charged in {country.strip().upper()}, outside your home country ({HOME_COUNTRY})."})
    if when.hour in ODD_HOURS:
        flags.append({"id": "odd_hour", "detail": f"Made at {when.strftime('%I:%M %p').lstrip('0')}, an unusual hour."})
    return flags


def severity(flags: list) -> str:
    score = sum(WEIGHTS[f["id"]] for f in flags)
    return "none" if score == 0 else "low" if score == 1 else "medium" if score == 2 else "high"


def record_transaction(user_id: str, amount: float, merchant: str, category, country: str, when: datetime) -> dict:
    flags = evaluate(user_id, amount, merchant, category, country, when)
    txn = {"transaction_id": "tx_" + uuid.uuid4().hex[:8], "user_id": user_id, "amount": amount,
           "merchant": merchant, "category": category, "country": country.strip().upper(),
           "timestamp": when.isoformat(timespec="minutes")}
    result = {**txn, "flagged": bool(flags), "flags": flags, "severity": severity(flags), "alert_id": None}
    if flags:
        alert = {"alert_id": "al_" + uuid.uuid4().hex[:8], "user_id": user_id, "transaction": txn, "flags": flags,
                 "severity": result["severity"], "explanation": None, "explanation_source": None}
        _alerts.append(alert)
        result["alert_id"] = alert["alert_id"]
    else:
        _learned[user_id].add(merchant.strip().lower())
    return result


def _facts(alert: dict) -> str:
    t = alert["transaction"]
    lines = [f"Transaction: {_money(t['amount'])} at {t['merchant']}"
             + (f" ({t['category']})" if t["category"] else "") + f", {t['country']}, {t['timestamp']}.",
             f"Severity: {alert['severity']}.", "Why it was flagged:"]
    return "\n".join(lines + [f"- {f['detail']}" for f in alert["flags"]])


def _plain_text(alert: dict) -> str:
    t = alert["transaction"]
    reasons = " ".join(f["detail"] for f in alert["flags"])
    return (f"Flux flagged your {_money(t['amount'])} charge at {t['merchant']}. {reasons} "
            "If this was you, no action is needed. If not, contact your bank.")


def short_text(alert: dict) -> str:
    """One short line for the notification list (the long copy stays in `explanation`)."""
    reasons = [SHORT_REASON.get(f["id"], f["id"].replace("_", " ")) for f in alert["flags"]][:2]
    t = alert["transaction"]
    return f"{_money(t['amount'])} at {t['merchant']} — {' and '.join(reasons)}."


def explain_alert(alert: dict, use_llm: bool = True):
    if alert["explanation"]:
        return alert["explanation"], alert["explanation_source"]
    if use_llm:
        try:
            out = llm.run_chain(_facts(alert), system=ALERT_PROMPT)
        except Exception:
            out = None
        if out:
            alert["explanation"], alert["explanation_source"] = llm.with_disclaimer(out[0]), out[1]
            return alert["explanation"], alert["explanation_source"]
    return llm.with_disclaimer(_plain_text(alert)), "fallback"


def alerts_for(user_id: str, explain: bool = True) -> list:
    mine = sorted((a for a in _alerts if a["user_id"] == user_id),
                  key=lambda a: a["transaction"]["timestamp"], reverse=True)
    out = []
    for i, a in enumerate(mine):
        text, source = explain_alert(a, use_llm=explain and i < MAX_LLM_EXPLANATIONS)
        out.append({**{k: a[k] for k in ("alert_id", "severity", "transaction", "flags")},
                    "summary": short_text(a),
                    "explanation": text, "explanation_source": source})
    return out


def seed_suspicious_demo(user_id: str, explain: bool = False) -> list:
    """Post the two classic suspicious charges used in Phase 3 demos (idempotent per user).

    1) Unusually large purchase vs this customer's own dining history
    2) New merchant + foreign country + odd hour (high severity)
    """
    if user_id in _seeded_demo or any(a["user_id"] == user_id for a in _alerts):
        _seeded_demo.add(user_id)
        return alerts_for(user_id, explain=explain)

    hist = _history().get(user_id, {})
    dining = hist.get("dining") or hist.get("_all") or []
    if len(dining) >= MIN_HISTORY:
        mean = statistics.fmean(dining)
        # Large enough to clear both the 1.5x mean and z-score >= 3 gates when std is normal.
        std = statistics.pstdev(dining) or mean * 0.2
        amount = max(mean * 4.0, mean + Z_LIMIT * std + 1.0, NO_HISTORY_LIMIT)
    else:
        amount = NO_HISTORY_LIMIT + 50.0

    record_transaction(
        user_id,
        round(amount, 2),
        "Chipotle",
        "dining",
        "US",
        datetime(2026, 11, 7, 12, 30),
    )
    record_transaction(
        user_id,
        40.0,
        "Crypto Exchange Ltd",
        "shopping",
        "RO",
        datetime(2026, 11, 7, 3, 12),
    )
    _seeded_demo.add(user_id)
    return alerts_for(user_id, explain=explain)
