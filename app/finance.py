"""Flux money math. Plain deterministic Python: no LLM, no randomness.

Every number Flux says comes from a function in this file (or from the vendored PNC
`wellness/` package, which it reuses for health metrics and cash forecasting).
A "user" is the dict saved by POST /onboard.
"""
from __future__ import annotations

from copy import deepcopy

from wellness.forecast import forecast_cash
from wellness.metrics import compute_metrics

EMERGENCY_MIN_MONTHS = 3
_RANK = {"risk": 0, "ok": 1, "good": 2}


def _r(x):
    return None if x is None else round(x, 2)


def monthly_debt_payments(user):
    """Scheduled payments on loans, the vehicle and the credit card, exactly as recorded."""
    total = sum(d["monthly_payment"] for d in user.get("debts", []))
    if user.get("vehicle"):
        total += user["vehicle"]["monthly_payment"]
    total += user.get("credit_card_payment", 0)
    total += user.get("debt_payment_adjust", 0)
    return round(max(total, 0), 2)


def monthly_surplus(user):
    return round(user["monthly_income"] - user["monthly_expenses"] - monthly_debt_payments(user), 2)


def build_profile(user):
    """Translate an onboarding record into the profile dict the PNC wellness code expects."""
    accounts, liabilities = [], user.get("credit_card_balance", 0)
    if user.get("credit_limit", 0) > 0:
        accounts.append({"type": "credit_card", "balance": user.get("credit_card_balance", 0),
                         "credit_limit": user["credit_limit"]})
    for d in user.get("debts", []):
        liabilities += d["balance"]
    assets = user["savings"]
    v = user.get("vehicle")
    if v:
        assets += v["value"]
        liabilities += v["loan_balance"]
    return {
        "monthly_income": user["monthly_income"],
        "avg_monthly_spending": user["monthly_expenses"],
        "monthly_debt_payments": monthly_debt_payments(user),
        "liquid_cash": user["savings"],
        "total_assets": round(assets, 2),
        "total_liabilities": round(liabilities, 2),
        "net_worth": round(assets - liabilities, 2),
        "accounts": accounts,
    }


def generate_budget(user):
    """Monthly budget built only from the user's own numbers.

    Spending categories are the user's real 12-month averages when a ledger exists; otherwise
    one `expenses` line with the number they typed. Debt payments are the scheduled payments.
    Savings is whatever income is left. If nothing is left, over_budget is true and `shortfall`
    shows the gap (total then exceeds income by the shortfall).
    """
    income, debt = user["monthly_income"], monthly_debt_payments(user)
    spend = dict(user.get("spending_by_category") or {"expenses": user["monthly_expenses"]})
    basis = "ledger_last_12_months" if user.get("spending_by_category") else "typed_in_expenses"
    leftover = round(income - debt - sum(spend.values()), 2)
    cats = {**spend, "debt_payments": round(debt, 2), "savings": max(leftover, 0.0)}
    return {"monthly_income": income, "basis": basis, "categories": cats,
            "total": round(sum(cats.values()), 2), "over_budget": leftover < 0,
            "shortfall": round(max(-leftover, 0), 2)}


def _explain(key, v):
    if key == "savings_rate":
        if v < 0:
            return (f"You spend about {abs(v) * 100:.1f}% more than you earn after debt payments; "
                    "aim to keep 20% or more.")
        return (f"You keep {v:.0%} of income after expenses and debt payments; aim for 20% or more.")
    if key == "debt_to_income":
        return (f"Debt payments take {v:.0%} of your income; under 20% is healthy, over 36% is risky.")
    if key == "emergency_fund_months":
        return (f"Your savings cover {v:.1f} months of bills; 3 months is a start, 6 is solid.")
    return (f"You use {v:.0%} of your credit limit; under 10% is great, over 30% hurts your score.")


def health_indicators(user):
    """Four indicators, each {id, label, value, status good|ok|risk, explanation}."""
    m = compute_metrics(build_profile(user))
    labels = {"savings_rate": "Savings rate", "debt_to_income": "Debt-to-income",
              "emergency_fund_months": "Emergency fund (months)",
              "credit_utilization": "Credit utilization"}
    out = []
    for key, label in labels.items():
        value, status = m["values"][key], m["status"][key]
        if value is None and key == "credit_utilization":
            out.append({"id": key, "label": label, "value": 0.0, "status": "good",
                        "explanation": "You have no credit card balance or limit on file."})
            continue
        if value is None:
            out.append({"id": key, "label": label, "value": None, "status": "ok",
                        "explanation": "Not enough data to calculate this yet."})
            continue
        status = "ok" if status == "watch" else status
        out.append({"id": key, "label": label, "value": value, "status": status,
                    "explanation": _explain(key, value)})
    return out


def money_overview(user):
    """One-shot snapshot of the numbers the user typed at onboarding (plus derived surplus).

    liquid_cash is checking + savings as sent by the app (backend field name: savings).
    """
    debt_pay = monthly_debt_payments(user)
    surplus = monthly_surplus(user)
    obligations = user["monthly_expenses"] + debt_pay
    return {
        "name": user.get("name"),
        "monthly_income": _r(user["monthly_income"]),
        "monthly_expenses": _r(user["monthly_expenses"]),
        "monthly_debt_payments": _r(debt_pay),
        "liquid_cash": _r(user["savings"]),
        "credit_card_balance": _r(user.get("credit_card_balance", 0)),
        "total_debt_balances": _r(
            user.get("credit_card_balance", 0)
            + sum(d.get("balance", 0) for d in user.get("debts", []))
            + (user.get("vehicle", {}) or {}).get("loan_balance", 0)
        ),
        "monthly_surplus": _r(surplus),
        "emergency_fund_months": _r(user["savings"] / obligations) if obligations else None,
        "goals": user.get("goals") or [],
    }


def can_afford(user, price):
    """Yes/no for a one-time purchase, plus impact on the monthly budget and emergency fund."""
    obligations = user["monthly_expenses"] + monthly_debt_payments(user)
    surplus = monthly_surplus(user)
    savings_after = user["savings"] - price
    before = user["savings"] / obligations if obligations else None
    after = savings_after / obligations if obligations else None
    fits_budget = 0 < price <= surplus
    keeps_fund = savings_after >= EMERGENCY_MIN_MONTHS * obligations
    affordable = price >= 0 and (fits_budget or keeps_fund) and savings_after >= 0
    if affordable and fits_budget:
        why = "It fits inside one month of your leftover cash."
    elif affordable:
        why = f"Paying from savings still leaves at least {EMERGENCY_MIN_MONTHS} months of bills covered."
    elif savings_after < 0:
        why = "It costs more than your total savings."
    else:
        why = (f"It is more than one month of leftover cash and would drop your emergency fund "
               f"below {EMERGENCY_MIN_MONTHS} months.")
    return {
        "price": _r(price), "affordable": affordable, "reason": why,
        "rule": f"Yes if it fits in one month of leftover cash, or if paying from savings keeps "
                f"{EMERGENCY_MIN_MONTHS}+ months of bills covered.",
        "monthly_surplus": surplus,
        "months_of_surplus_to_save_up": _r(price / surplus) if surplus > 0 else None,
        "savings_before": _r(user["savings"]), "savings_if_paid_from_savings": _r(savings_after),
        "emergency_fund_months_before": _r(before),
        "emergency_fund_months_if_paid_from_savings": _r(after),
    }


def retirement_check(user, target_age, annual_income=None, current_savings=None,
                     monthly_contribution=None, annual_return_pct=None, current_age=None):
    """Will the retirement account reach the amount needed by target_age?

    No hidden assumptions. Each input is either given by the user or read from their records;
    if one is unavailable the function lists it under `missing_inputs` instead of guessing.
      annual_income        yearly income the user WANTS in retirement (always from the user)
      current_savings      retirement balance (default: the IRA balance on record)
      monthly_contribution what they actually put in each month (default: IRA deposits on record)
      annual_return_pct    yearly return (default: the IRA's recorded yield)
      current_age          how old they are now (default: the age on record; some users have none)
    Needed balance = desired income / yearly return, i.e. living on returns without spending
    principal. Growth compounds monthly. Nominal dollars: no inflation, taxes or Social Security.
    """
    rec = user.get("retirement") or {}
    given = {"annual_income": annual_income, "current_savings": current_savings,
             "monthly_contribution": monthly_contribution, "annual_return_pct": annual_return_pct,
             "current_age": current_age}
    records = {"current_age": user.get("age"), "current_savings": rec.get("balance"), "monthly_contribution": rec.get("monthly_contribution"),
               "annual_return_pct": rec.get("annual_return_pct")}
    labels = {"annual_income": "annual_income (the yearly income you want in retirement)",
              "current_savings": "current_savings (what you have saved for retirement)",
              "monthly_contribution": "monthly_contribution (what you put in each month)",
              "annual_return_pct": "annual_return_pct (expected yearly return in percent)",
              "current_age": "current_age (how old you are now)"}
    used, inputs, missing = {}, {}, []
    for key in labels:
        if given[key] is not None:
            used[key], inputs[key] = given[key], {"value": given[key], "source": "provided by the user"}
        elif records.get(key) is not None:
            used[key], inputs[key] = records[key], {"value": records[key], "source": "the user's records"}
        else:
            missing.append(labels[key])
    if missing:
        return {"missing_inputs": missing,
                "message": "Ask the user for these values. Do not guess them."}
    if used["annual_return_pct"] <= 0:
        return {"error": "annual_return_pct must be above 0 to size the target balance."}

    years = max(target_age - used["current_age"], 0)
    n = years * 12
    rm = used["annual_return_pct"] / 100 / 12
    growth = (1 + rm) ** n
    annuity = (growth - 1) / rm
    projected = used["current_savings"] * growth + used["monthly_contribution"] * annuity
    needed = used["annual_income"] / (used["annual_return_pct"] / 100)
    gap = max(needed - used["current_savings"] * growth, 0)
    return {
        "on_track": projected >= needed, "target_age": target_age, "current_age": used["current_age"],
        "years_to_go": years, "desired_annual_income": _r(used["annual_income"]),
        "projected_balance": _r(projected), "needed_balance": _r(needed),
        "shortfall": _r(max(needed - projected, 0)),
        "monthly_contribution_used": _r(used["monthly_contribution"]),
        "monthly_contribution_needed": _r(gap / annuity) if n else None,
        "inputs": inputs,
        "rule": "Needed balance = desired yearly income / yearly return (live on returns, keep the principal).",
        "limits": "Nominal dollars; no inflation, taxes or Social Security.",
    }


def spending_breakdown(user, months=3):
    """Average monthly spending by category over the last N months, versus the N months before."""
    hist = user.get("spending_history")
    if not hist:
        return {"missing_inputs": ["spending history (no transactions on record for this user)"],
                "message": "Tell the user there is no transaction history to analyze."}
    months = max(1, min(int(months), len(hist) // 2 or 1))
    keys = sorted(hist)
    last, prev = keys[-months:], keys[-2 * months:-months]

    def avg(period):
        out = {}
        for m in period:
            for cat, amt in hist[m].items():
                out[cat] = out.get(cat, 0) + amt / len(period)
        return out

    now, before = avg(last), avg(prev)
    rows = []
    for cat, a in sorted(now.items(), key=lambda kv: -kv[1]):
        b = before.get(cat)
        rows.append({"category": cat, "monthly_average": _r(a),
                     "change_vs_previous_period_pct": round((a - b) / b * 100, 1) if b else None})
    return {"period": f"{last[0]} to {last[-1]}", "months": months,
            "monthly_average_total": _r(sum(now.values())),
            "top_category": rows[0]["category"], "by_category": rows}


def forecast_balances(user, months=12):
    """Month-by-month cash balance using current income, expenses and debt payments."""
    months = max(1, min(int(months), 60))
    p = build_profile(user)
    fc = forecast_cash(p, months)
    negative = [x["month"] for x in fc["projection"] if x["cash"] < 0]
    return {
        "months": months, "starting_balance": _r(p["liquid_cash"]),
        "monthly_income": p["monthly_income"],
        "monthly_obligations": _r(p["avg_monthly_spending"] + p["monthly_debt_payments"]),
        "monthly_net_cash_flow": fc["monthly_net_cash_flow"],
        "ending_balance": fc["projection"][-1]["cash"], "lowest_balance": fc["min_cash"],
        "goes_negative": fc["goes_negative"], "first_negative_month": negative[0] if negative else None,
        "projection": fc["projection"],
    }


def what_if(user, monthly_income_change=0.0, monthly_expenses_change=0.0, savings_change=0.0,
            debt_payment_change=0.0, credit_card_balance_change=0.0):
    """Health indicators before and after applying changes (negative numbers reduce)."""
    new = deepcopy(user)
    new["monthly_income"] = max(user["monthly_income"] + monthly_income_change, 0.01)
    new["monthly_expenses"] = max(user["monthly_expenses"] + monthly_expenses_change, 0)
    new["savings"] = max(user["savings"] + savings_change, 0)
    new["credit_card_balance"] = max(user.get("credit_card_balance", 0) + credit_card_balance_change, 0)
    new["debt_payment_adjust"] = user.get("debt_payment_adjust", 0) + debt_payment_change
    before, after = health_indicators(user), health_indicators(new)
    rows = []
    for b, a in zip(before, after):
        delta = None if b["value"] is None or a["value"] is None else round(a["value"] - b["value"], 4)
        rows.append({"id": b["id"], "label": b["label"], "before": b["value"], "after": a["value"],
                     "change": delta, "status_before": b["status"], "status_after": a["status"],
                     "better": _RANK[a["status"]] > _RANK[b["status"]],
                     "worse": _RANK[a["status"]] < _RANK[b["status"]]})
    return {"changes": {"monthly_income_change": monthly_income_change,
                        "monthly_expenses_change": monthly_expenses_change,
                        "savings_change": savings_change, "debt_payment_change": debt_payment_change,
                        "credit_card_balance_change": credit_card_balance_change},
            "monthly_surplus_before": monthly_surplus(user), "monthly_surplus_after": monthly_surplus(new),
            "indicators": rows}


def trade_in_equity(value, loan_balance):
    """Equity = what the car is worth minus what is still owed (negative = underwater)."""
    return round(value - loan_balance, 2)


TRADE_IN_MIN_EQUITY_RATIO = 0.20


def trade_in_check(user):
    """Estimate equity, say whether trading in now makes sense, and give ONE next step.

    next_step.type is self_service, follow_up or eligible_offer. The offer is a stub: no real
    Toyota offer is looked up.
    """
    v = user.get("vehicle")
    if not v:
        return {"has_vehicle": False, "makes_sense_now": False,
                "next_step": {"type": "self_service",
                              "action": "Add your vehicle (make, model, year, value, loan balance) to get a trade-in estimate."}}
    equity = trade_in_equity(v["value"], v["loan_balance"])
    ratio = equity / v["value"] if v["value"] else 0
    base = {"has_vehicle": True,
            "vehicle": f"{v['year']} {v['make']} {v['model']}",
            "estimated_value": _r(v["value"]), "loan_balance": _r(v["loan_balance"]),
            "estimated_equity": equity, "equity_ratio": round(ratio, 4),
            "note": "Estimate from the numbers you entered; a dealer appraisal will differ."}
    if equity < 0:
        return {**base, "makes_sense_now": False,
                "reason": f"You owe ${-equity:,.0f} more than the car is worth, so a trade-in would roll that debt into the next loan.",
                "next_step": {"type": "follow_up",
                              "action": "Talk to a Toyota Financial Services advisor about payoff options before trading in."}}
    if ratio >= TRADE_IN_MIN_EQUITY_RATIO:
        return {**base, "makes_sense_now": True,
                "reason": f"You have ${equity:,.0f} of equity ({ratio:.0%} of the value), enough to use as a down payment.",
                "next_step": {"type": "eligible_offer",
                              "action": "You look eligible for a trade-in offer; ask your Toyota dealer to appraise the car."}}
    return {**base, "makes_sense_now": False,
            "reason": f"Your equity is ${equity:,.0f} ({ratio:.0%} of the value); waiting until it reaches {TRADE_IN_MIN_EQUITY_RATIO:.0%} gives you a stronger down payment.",
            "next_step": {"type": "self_service",
                          "action": "Keep making your payments and re-run this check in a few months."}}
