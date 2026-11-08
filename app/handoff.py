"""Human-agent handoff summary: who, what, why, next step. Plain Python over the user's records (no LLM)."""
from app import finance, fraud, toyota


def _pnc_or_form(user: dict) -> dict:
    ind = finance.health_indicators(user)
    risks = [i for i in ind if i["status"] == "risk"]
    what = "Financial health: " + "; ".join(f"{i['label']} {i['status']}" for i in ind) + "."
    why = [f"{i['label']} is at risk: {i['explanation']}" for i in risks]
    return {"what": what, "why": why,
            "next_step": "Review the at-risk indicators with the customer." if risks
            else "Answer the customer's question; no financial risks flagged."}


def _toyota(user: dict) -> dict:
    r = toyota.next_move_options(user)
    c, v, g = r["contract"], r["vehicle"], r["guardrails"]
    what = (f"{v['description']} {c['contract_type']}, ${c['monthly_payment']:,.2f}/mo, "
            f"{c['months_remaining']} months left, {c['missed_payments_12m']} missed payment(s) in 12 months. "
            f"Customer said: \"{r['situation']['customer_says']}\"")
    why = [x.capitalize() for x in g["human_reasons"]] or ["Customer asked for a person."]
    step = f"Contact by {g['preferred_channel']}. " + ("No upsell or marketing. " if not g["upsell_allowed"] else "") \
        + "Offer a specialist call to talk through options."
    return {"what": what, "why": why, "next_step": step}


def build(user: dict, reason: str = None, conversation: list = None) -> dict:
    part = _toyota(user) if user.get("source") == "toyota_pack" else _pnc_or_form(user)
    alerts = fraud.alerts_for(user["user_id"], explain=False) if user.get("user_id") else []
    why = ([reason] if reason else []) + part["why"]
    if alerts:
        why.append(f"{len(alerts)} flagged transaction(s), highest severity "
                   f"{max((a['severity'] for a in alerts), key=['low', 'medium', 'high'].index)}.")
    next_step = part["next_step"]
    if alerts:
        next_step += " Review the flagged transactions with the customer."
    who = f"{user['name']}" + (f", {user['age']}" if user.get("age") else "")
    lines = [f"WHO: {who} ({user.get('user_id', 'new user')})", f"WHAT: {part['what']}",
             "WHY THEY NEED A PERSON: " + ("; ".join(why) if why else "Customer requested a human."),
             f"NEXT STEP: {next_step}"]
    if conversation:
        lines.append("RECENT CHAT: " + " | ".join(conversation[-6:]))
    return {"user_id": user.get("user_id"), "who": who, "what": part["what"], "why": why or ["Customer requested a human."],
            "next_step": next_step, "open_alerts": len(alerts), "summary": "\n".join(lines)}
