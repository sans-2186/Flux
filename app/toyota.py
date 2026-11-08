"""Toyota "Next Move" data pack (mock/toyota/*.csv): contract facts and precomputed options.

Every number comes from the pack; nothing is calculated or guessed here. What this module adds:
  * guardrails enforced in code (not left to the prompt): vulnerable customers / 2+ missed
    payments get no upsell, customers without marketing consent get no new-vehicle offers.
    Withheld offers are never shown to Gemini.
  * one "next step" label per option: Self-service, Follow-up or Eligible offer.
golden_answers.csv is the judges' answer key. It is used by tests only, never by the agent.
"""
import csv
from collections import defaultdict
from datetime import date
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "mock" / "toyota"
ID_PREFIX = "TY-"
TODAY = date(2026, 11, 7)  # "today" inside the data pack
NEW_VEHICLE_IDS = {"TRADE", "RENEW"}
EXTRA_STEP_TYPES = {"KEEP": "Self-service", "EXTENDLEASE": "Follow-up", "EARLYEND": "Follow-up"}
_data = None


def _num(s):
    if s == "":
        return None
    for cast in (int, float):
        try:
            return cast(s)
        except ValueError:
            pass
    return s


def _rows(name):
    with open(DIR / name, newline="") as f:
        return [{k: _num(v) for k, v in row.items()} for row in csv.DictReader(f)]


def _step_label(catalog_type):
    return {"Offer": "Eligible offer", "Self-service": "Self-service"}.get(catalog_type, "Follow-up")


def _load():
    global _data
    if _data is None:
        catalog = {o["offer_id"]: o for o in _rows("offers_catalog.csv")}
        by = {name: {r["customer_id"]: r for r in _rows(f"{name}.csv")}
              for name in ("customers", "vehicles", "accounts", "situations")}
        options = defaultdict(list)
        for o in _rows("option_scenarios.csv"):
            options[o["customer_id"]].append(o)
        users = {}
        for cid, c in by["customers"].items():
            users[ID_PREFIX + cid] = {
                "user_id": ID_PREFIX + cid, "source": "toyota_pack", "name": c["first_name"], "age": c["age"],
                "customer": c, "vehicle": by["vehicles"][cid], "account": by["accounts"][cid],
                "situation": by["situations"][cid], "options": options[cid]}
        _data = {"users": users, "catalog": catalog}
    return _data


def get_user(user_id):
    return _load()["users"].get(user_id)


def list_users():
    out = []
    for u in _load()["users"].values():
        v = u["vehicle"]
        out.append({"user_id": u["user_id"], "name": u["name"], "age": u["age"],
                    "vehicle": f"{v['model_year']} {v['model']} {v['trim']}",
                    "contract_type": u["account"]["contract_type"],
                    "customer_says": u["situation"]["customer_says"]})
    return out


def guardrails(user):
    """Rules from the pack's responsible-AI checklist, applied in code."""
    c, a, v = user["customer"], user["account"], user["vehicle"]
    distressed = c["vulnerable_flag"] == "Y" or a["missed_payments_12m"] >= 2
    ltv = a["current_balance"] / v["est_market_value_now"] if a.get("current_balance") else None
    reasons = []
    if c["vulnerable_flag"] == "Y":
        reasons.append("customer is marked vulnerable")
    if a["missed_payments_12m"] >= 2:
        reasons.append(f"{a['missed_payments_12m']} missed payments in the last 12 months")
    if c["digital_engagement"] == "Low":
        reasons.append("low digital engagement")
    if ltv is not None and ltv > 1.25:
        reasons.append("owes more than 125% of the vehicle's value")
    rules = []
    if distressed:
        rules.append("No upsell and no marketing. Do not suggest paying extra. Offer a human specialist.")
    if c["marketing_consent"] == "N":
        rules.append("No marketing consent: do not present new-vehicle offers.")
    return {"upsell_allowed": not distressed,
            "new_vehicle_offers_allowed": (not distressed) and c["marketing_consent"] == "Y",
            "must_offer_human": distressed,
            "human_specialist_available": bool(reasons), "human_reasons": reasons,
            "preferred_channel": c["preferred_channel"], "rules_applied": rules}


def _status(eligibility):
    if eligibility == "Y":
        return "eligible"
    if eligibility == "Review":
        return "review"
    return "caution" if str(eligibility).startswith("Caution") else "not_eligible"


def _facts(user):
    c, a, v, s = user["customer"], user["account"], user["vehicle"], user["situation"]

    def clean(d):
        return {k: x for k, x in d.items() if x is not None}

    def past(d):
        return date.fromisoformat(d) < TODAY

    return {
        "data_as_of": TODAY.isoformat(),
        "situation": {"customer_says": s["customer_says"], "context": s["context_summary"]},
        "customer": clean({k: c[k] for k in (
            "first_name", "age", "city", "occupation", "annual_income", "credit_tier_at_origination",
            "credit_tier_now", "payment_to_income_pct", "debt_to_income_pct", "financial_stress_score",
            "preferred_channel", "autopay")}),
        "contract": clean({k: a[k] for k in (
            "contract_type", "monthly_payment", "apr", "money_factor", "months_remaining", "contract_end",
            "current_balance", "payoff_quote", "residual_value", "mileage_allowance_total", "est_equity",
            "missed_payments_12m")}),
        "vehicle": {"description": f"{v['model_year']} {v['model']} {v['trim']}", "odometer": v["odometer_now"],
                    "estimated_market_value": v["est_market_value_now"],
                    "service_overdue": past(v["next_service_due"]), "next_service_due": v["next_service_due"],
                    "open_recall": v["open_recall"] == "Y",
                    "toyota_care_ended": past(v["toyota_care_ends"]),
                    "basic_warranty_ended": past(v["basic_warranty_ends"])},
    }


def next_move_options(user):
    """Facts, guardrails and the options this customer may be shown. The agent picks ONE and explains."""
    g = guardrails(user)
    catalog = _load()["catalog"]
    a = user["account"]
    shown, not_eligible = [], []
    for o in user["options"]:
        oid = o["option_id"]
        catalog_type = catalog[oid]["next_step_type"] if oid in catalog else None
        if catalog_type == "Offer" and not g["upsell_allowed"]:
            continue
        if oid in NEW_VEHICLE_IDS and not g["new_vehicle_offers_allowed"]:
            continue
        if oid == "EXTRA100" and g["must_offer_human"]:
            continue
        row = {"option_id": oid, "name": o["option_name"], "status": _status(o["eligibility"]),
               "eligibility_detail": o["eligibility"], "summary": o["plain_language_summary"],
               "new_monthly_payment": o["new_monthly_payment"],
               "monthly_payment_change": o["monthly_payment_change"], "upfront_cost": o["upfront_cost"],
               "total_cost_vs_keep_as_is": o["total_cost_vs_keep_as_is"],
               "key_assumption": o["key_assumption"], "tradeoff": o["tradeoff"],
               "next_step_type": EXTRA_STEP_TYPES.get(oid) or _step_label(catalog_type)}
        if oid == "TRADE" and a["contract_type"] == "loan" and a["months_remaining"] <= 12:
            row["timing_note"] = (f"Only {a['months_remaining']} payments are left; waiting until the loan "
                                  f"ends is simpler and leaves no balance to roll over. Do not push this.")
        row = {k: x for k, x in row.items() if x is not None}
        (not_eligible if row["status"] == "not_eligible" else shown).append(row)

    if a["autopay"] == "N":
        shown.append({"option_id": "AUTOPAY", "name": "Turn on autopay", "status": "eligible",
                      "summary": f"Autopay takes your ${a['monthly_payment']:,.2f} payment out on day "
                                 f"{a['payment_due_day']} each month, so a payment is never missed.",
                      "key_assumption": "Payment amount and due date stay the same.",
                      "tradeoff": "Money leaves your account automatically, so keep enough in it.",
                      "next_step_type": "Self-service"})
    if a["contract_type"] == "loan":
        shown.append({"option_id": "PAYOFF", "name": "Get a payoff quote", "status": "eligible",
                      "summary": f"Payoff quote today: ${a['payoff_quote']:,.2f} (current balance "
                                 f"${a['current_balance']:,.2f}).",
                      "key_assumption": "Quote is for today; it changes a little each day.",
                      "tradeoff": "Finishing early ends the loan sooner but uses cash you may want for other things.",
                      "next_step_type": "Self-service"})
    if g["human_specialist_available"]:
        shown.append({"option_id": "HUMAN", "name": "Talk to a Toyota specialist", "status": "eligible",
                      "summary": f"A specialist can walk through your options with you by {g['preferred_channel']}.",
                      "key_assumption": "Reasons: " + "; ".join(g["human_reasons"]) + ".",
                      "tradeoff": "Takes a call or visit instead of a quick tap in the app.",
                      "next_step_type": "Follow-up"})

    return {**_facts(user), "guardrails": g, "options": shown, "not_eligible": not_eligible,
            "note": "Withheld options are not allowed for this customer; never suggest or mention them."}


def trade_in_check(user):
    """Equity, whether trading in now makes sense, and ONE next step. Rules are applied in this order."""
    g, a, v = guardrails(user), user["account"], user["vehicle"]
    equity, value = a["est_equity"], v["est_market_value_now"]
    base = {"vehicle": f"{v['model_year']} {v['model']} {v['trim']}", "contract_type": a["contract_type"],
            "estimated_value": value, "estimated_equity": equity,
            "note": "Value is an estimate; a dealer appraisal decides the final number."}
    if a["contract_type"] == "lease":
        return {**base, "applies": False, "makes_sense_now": False,
                "reason": "This is a lease, so there is no trade-in. Equity here is market value minus the "
                          "residual and buyout fee.",
                "next_step": {"type": "Self-service",
                              "action": "Compare lease buyout, return and renewal (see next_move_options)."}}
    base.update({"applies": True, "payoff": a["payoff_quote"], "months_remaining": a["months_remaining"]})
    if g["must_offer_human"]:
        return {**base, "makes_sense_now": False,
                "reason": "No sales offers for this customer right now.",
                "next_step": {"type": "Follow-up", "action": "A specialist can review your options with you."}}
    if "owes more than 125% of the vehicle's value" in g["human_reasons"]:
        return {**base, "makes_sense_now": False,
                "reason": f"You owe about ${-equity:,.0f} more than the car is worth, which is more than a trade-in can cover.",
                "next_step": {"type": "Follow-up", "action": "Talk to a specialist about options for the negative equity."}}
    if equity < 0:
        return {**base, "makes_sense_now": False,
                "reason": f"You owe about ${-equity:,.0f} more than the car is worth; a trade-in would roll that into the next loan.",
                "next_step": {"type": "Self-service",
                              "action": "Keep paying; check again when the car is worth more than you owe."}}
    if not g["new_vehicle_offers_allowed"]:
        return {**base, "makes_sense_now": False, "reason": "New-vehicle offers are not allowed for this customer.",
                "next_step": {"type": "Self-service", "action": "Get a payoff quote any time in the app."}}
    if a["months_remaining"] <= 12:
        return {**base, "makes_sense_now": False,
                "reason": f"Only {a['months_remaining']} payments are left; waiting until the loan ends is simpler "
                          f"and leaves no balance to roll over.",
                "next_step": {"type": "Self-service", "action": "Get a payoff quote and wait until the loan ends."}}
    return {**base, "makes_sense_now": True,
            "reason": f"You have about ${equity:,.0f} of equity that can go toward a new Toyota.",
            "next_step": {"type": "Eligible offer", "action": "Get a trade-in estimate and see new Toyota payment options."}}


def fallback_text(user):
    """Plain summary from the data when Gemini is unreachable."""
    r = next_move_options(user)
    if r["guardrails"]["must_offer_human"]:
        return (f"Flux could not reach the AI just now. A Toyota specialist can help you by "
                f"{r['guardrails']['preferred_channel']}. Next step (Follow-up): ask for a specialist.")
    picks = [o for o in r["options"] if o["status"] == "eligible" and o["option_id"] != "KEEP"][:3]
    lines = " ".join(o["summary"] for o in picks) or "No options are available right now."
    return (f"Flux could not reach the AI just now, so here is what the data shows. {lines} "
            f"Next step (Self-service): open the Toyota app to pick one.")
