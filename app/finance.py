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
CARD_MIN_RATE = 0.02
CARD_MIN_FLOOR = 25.0
BUDGET_SAVINGS_RATE = 0.20
BUDGET_WEIGHTS = [("housing", 0.40), ("food", 0.20), ("transport", 0.10),
                  ("utilities", 0.08), ("fun", 0.15), ("subscriptions", 0.07)]
_RANK = {"risk": 0, "ok": 1, "good": 2}


def _r(x):
    return None if x is None else round(x, 2)


def monthly_debt_payments(user):
    """Loan payments + vehicle payment + an assumed credit-card minimum payment."""
    total = sum(d["monthly_payment"] for d in user.get("debts", []))
    if user.get("vehicle"):
        total += user["vehicle"]["monthly_payment"]
    ccb = user.get("credit_card_balance", 0)
    if ccb > 0:
        total += max(CARD_MIN_FLOOR, CARD_MIN_RATE * ccb)
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
    """Recommended monthly budget: fixed debt payments, 20% savings, rest split by fixed weights.

    Categories sum to monthly income unless debt payments alone exceed income (over_budget).
    """
    income, debt = user["monthly_income"], monthly_debt_payments(user)
    available = income - debt
    savings = min(BUDGET_SAVINGS_RATE * income, max(available, 0))
    pool = max(available - savings, 0)
    cats = {name: round(pool * w, 2) for name, w in BUDGET_WEIGHTS}
    cats["debt_payments"] = round(debt, 2)
    cats["savings"] = round(savings, 2)
    if available >= 0:
        cats["savings"] = round(cats["savings"] + income - sum(cats.values()), 2)
    return {"monthly_income": income, "categories": cats, "total": round(sum(cats.values()), 2),
            "over_budget": available < 0,
            "current_monthly_expenses": user["monthly_expenses"]}


def _explain(key, v):
    if key == "savings_rate":
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
        "monthly_surplus": surplus,
        "months_of_surplus_to_save_up": _r(price / surplus) if surplus > 0 else None,
        "savings_before": _r(user["savings"]), "savings_if_paid_from_savings": _r(savings_after),
        "emergency_fund_months_before": _r(before),
        "emergency_fund_months_if_paid_from_savings": _r(after),
    }


def retirement_check(user, target_age, annual_income=None, current_savings=None,
                     contribution_rate=0.15, real_return=0.05,
                     replacement_rate=0.80, withdrawal_rate=0.04):
    """Project retirement savings in today's dollars. Social Security is ignored (conservative)."""
    income = annual_income if annual_income else user["monthly_income"] * 12
    start = user["savings"] if current_savings is None else current_savings
    years = max(target_age - user["age"], 0)
    growth = (1 + real_return) ** years
    annual_contrib = income * contribution_rate
    annuity = years if real_return == 0 else (growth - 1) / real_return
    projected = start * growth + annual_contrib * annuity
    needed = income * replacement_rate / withdrawal_rate
    gap = max(needed - start * growth, 0)
    required_monthly = (gap / annuity / 12) if annuity else None
    return {
        "on_track": projected >= needed, "target_age": target_age, "current_age": user["age"],
        "years_to_go": years, "projected_balance": _r(projected), "needed_balance": _r(needed),
        "shortfall": _r(max(needed - projected, 0)),
        "monthly_contribution_assumed": _r(annual_contrib / 12),
        "monthly_contribution_needed": _r(required_monthly),
        "assumptions": [
            f"Annual income used: ${income:,.0f}; current savings used: ${start:,.0f}",
            f"You save {contribution_rate:.0%} of income every year",
            f"{real_return:.0%} yearly investment return after inflation (today's dollars)",
            f"You need {replacement_rate:.0%} of your income in retirement",
            f"You withdraw {withdrawal_rate:.0%} per year, so the target is "
            f"{replacement_rate / withdrawal_rate:.0f}x annual income",
            "Social Security and pensions are ignored",
        ],
    }


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
