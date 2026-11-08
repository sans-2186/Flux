"""Personalized coach: Gemini function calling over the deterministic tools in app/finance.py.

Gemini never does math. It picks a tool, the tool returns exact numbers, Gemini explains them.
"""
from __future__ import annotations

from typing import Optional

from app import finance, llm

COACH_PROMPT = (
    "You are Flux, a friendly voice-first money coach for Gen Z, talking to {name}. "
    "You know NOTHING about their money except what the tools return. "
    "For any question about their finances, call the right tool first, then explain the result. "
    "Never do arithmetic yourself and never invent numbers: only quote numbers from tool results. "
    "Use tool results to give a clear yes or no when they ask for one. "
    "For retirement answers, mention the key assumptions briefly. "
    "For car trade-in answers, state the equity and give the single next step. "
    "If the question is general and needs no personal numbers, just explain it simply. "
    "Answer in 3 to 5 short, casual sentences with no markdown, lists or emojis, because it is read aloud. "
    "Do not add a disclaimer; the app adds one."
)


def make_tools(user: dict, trace: list):
    """Build the tool functions Gemini may call. Docstrings become the tool descriptions."""

    def can_afford(price: float) -> dict:
        """Check if the user can afford a one-time purchase. Returns yes/no (affordable), the reason,
        and the impact on the monthly budget and emergency fund. price is in dollars."""
        trace.append("can_afford")
        return finance.can_afford(user, price)

    def retirement_check(target_age: int, annual_income: Optional[float] = None,
                         current_savings: Optional[float] = None) -> dict:
        """Check if the user is on track to retire at target_age. annual_income is yearly income in
        dollars and current_savings is dollars saved so far; both default to the user's profile if
        omitted. Returns on_track, projected balance, needed balance and the assumptions used."""
        trace.append("retirement_check")
        return finance.retirement_check(user, target_age, annual_income, current_savings)

    def forecast_balances(months: int = 12) -> dict:
        """Project the user's cash balance for the next number of months, with monthly income,
        obligations, ending balance and whether it ever goes negative."""
        trace.append("forecast_balances")
        return finance.forecast_balances(user, months)

    def what_if(monthly_income_change: float = 0.0, monthly_expenses_change: float = 0.0,
                savings_change: float = 0.0, debt_payment_change: float = 0.0,
                credit_card_balance_change: float = 0.0) -> dict:
        """Show the user's health indicators before and after a change. Each argument is a dollar
        change; use negative numbers to reduce (for example cutting spending by 200 dollars a month
        is monthly_expenses_change=-200). Returns before/after values and statuses."""
        trace.append("what_if")
        return finance.what_if(user, monthly_income_change, monthly_expenses_change,
                               savings_change, debt_payment_change, credit_card_balance_change)

    def trade_in_check() -> dict:
        """Estimate the equity in the user's car (value minus loan balance), whether trading it in
        now makes sense, and ONE next step (self_service, follow_up or eligible_offer)."""
        trace.append("trade_in_check")
        return finance.trade_in_check(user)

    def health_check() -> dict:
        """Get the user's financial health indicators: savings rate, debt-to-income, emergency
        fund months and credit utilization, each with a good/ok/risk status."""
        trace.append("health_check")
        return {"indicators": finance.health_indicators(user)}

    return [can_afford, retirement_check, forecast_balances, what_if, trade_in_check, health_check]


def health_fallback(user: dict) -> str:
    """Plain deterministic summary used when Gemini is unreachable."""
    parts = [f"{i['label']}: {i['status']}. {i['explanation']}" for i in finance.health_indicators(user)]
    return ("Flux could not reach the AI just now, so here is your snapshot from the numbers. "
            + " ".join(parts))


def coach_reply(user: dict, message: str):
    """Returns (text, source, tools_used)."""
    trace: list[str] = []
    result = llm.run_chain(message, COACH_PROMPT.format(name=user["name"]), make_tools(user, trace))
    tools_used = list(dict.fromkeys(trace))
    if result is None:
        return health_fallback(user), "fallback_health", tools_used
    return result[0], result[1], tools_used
