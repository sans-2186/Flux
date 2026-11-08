"""Personalized coach: Gemini function calling over the deterministic tools in app/finance.py.

Gemini never does math. It picks a tool, the tool returns exact numbers, Gemini explains them.
"""
from __future__ import annotations

from app import finance, llm, toyota

COACH_PROMPT = (
    "You are Flux, a friendly voice-first money coach for Gen Z, talking to {name}. "
    "You know NOTHING about their money except what the tools return. "
    "For any question about their finances, call money_overview first (or the more specific tool), then explain the result. "
    "Never do arithmetic yourself and never invent or assume numbers: only quote numbers from tool results. "
    "If a tool reports missing_inputs, ask the user for exactly those values and stop; do not guess them. "
    "Use tool results to give a clear yes or no when they ask for one. "
    "For retirement answers, say which inputs came from the user's records and which they gave you. "
    "For car trade-in answers, state the equity and give the single next step. "
    "If the question is general and needs no personal numbers, just explain it simply. "
    "Answer in 3 to 5 short, casual sentences with no markdown, lists or emojis, because it is read aloud. "
    "Do not add a disclaimer; the app adds one."
)

TOYOTA_PROMPT = (
    "You are Flux, the Toyota 'Next Move' assistant, talking to {name} about their Toyota. "
    "Always call next_move_options first for any question about their car, loan, lease or next move; "
    "also call trade_in_check for trade-in questions. "
    "Use ONLY numbers that appear in tool results. Never invent rates, payments or eligibility, and never do arithmetic. "
    "Explain at an 8th-grade reading level and define any jargon in one short line. "
    "Recommend ONE best next move, then name one or two alternatives and the trade-off of each (cost now vs cost later). "
    "State assumptions out loud (rate source, estimated vehicle value, taxes excluded). "
    "Only suggest options listed in the tool result; never mention anything that is not listed. "
    "Obey the guardrails in the result: if upsell is not allowed or the customer sounds distressed, no upsell, "
    "no marketing, and offer a human specialist. Respect any timing_note and do not push a new vehicle. "
    "If nothing is eligible, say so honestly and say when to re-check. "
    "End with exactly one next step labeled Self-service, Follow-up, or Eligible offer. "
    "Never give legal, tax or credit-repair advice. All data is synthetic. "
    "Use 5 to 7 short, casual sentences with no markdown, lists or emojis, because it is read aloud. "
    "Do not add a disclaimer; the app adds one."
)


def make_toyota_tools(user: dict, trace: list):
    def next_move_options() -> dict:
        """Get the customer's situation, contract and vehicle facts, the guardrails that apply, and the
        options they may be shown (with payments, cost versus keeping the contract, assumptions and
        trade-offs). Pick ONE best move from the options."""
        trace.append("next_move_options")
        return toyota.next_move_options(user)

    def trade_in_check() -> dict:
        """Estimate the equity in the customer's Toyota (value minus payoff), say whether trading in now
        makes sense, and give ONE next step (Self-service, Follow-up or Eligible offer)."""
        trace.append("trade_in_check")
        return toyota.trade_in_check(user)

    return [next_move_options, trade_in_check]


def make_tools(user: dict, trace: list):
    """Build the tool functions Gemini may call. Docstrings become the tool descriptions."""
    if user.get("source") == "toyota_pack":
        return make_toyota_tools(user, trace)

    def money_overview() -> dict:
        """Get the user's onboarding money snapshot in one call: income, expenses, debt payments,
        liquid cash (checking + savings), debt balances, monthly surplus, emergency-fund months,
        and goals. Call this first for any question about their balances or budget."""
        trace.append("money_overview")
        return finance.money_overview(user)

    def can_afford(price: float) -> dict:
        """Check if the user can afford a one-time purchase. Returns yes/no (affordable), the reason,
        and the impact on the monthly budget and emergency fund. price is in dollars."""
        trace.append("can_afford")
        return finance.can_afford(user, price)

    # Parameters are plain `float = None`, not Optional[float]: the SDK rejects whole numbers
    # (e.g. 90000) for Optional[float] but accepts them for float.
    def retirement_check(target_age: float, annual_income: float = None, current_savings: float = None,
                         monthly_contribution: float = None, annual_return_pct: float = None,
                         current_age: float = None) -> dict:
        """Check if the user can retire at target_age. annual_income is the YEARLY INCOME THEY WANT
        IN RETIREMENT in dollars (for 'retire at 50 on 90k' use 90000). The other values default to
        the user's records; only pass them if the user stated them (current_age too). If the result has
        missing_inputs, ask the user for those values instead of guessing."""
        trace.append("retirement_check")
        return finance.retirement_check(user, int(target_age), annual_income, current_savings,
                                        monthly_contribution, annual_return_pct,
                                        None if current_age is None else int(current_age))

    def spending_breakdown(months: float = 3) -> dict:
        """Average monthly spending by category over the last N months from the user's real
        transaction history, with the change versus the N months before."""
        trace.append("spending_breakdown")
        return finance.spending_breakdown(user, months)

    def forecast_balances(months: float = 12) -> dict:
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

    return [money_overview, can_afford, retirement_check, forecast_balances, what_if, trade_in_check,
            spending_breakdown, health_check]


def health_fallback(user: dict) -> str:
    """Plain deterministic summary used when Gemini is unreachable."""
    if user.get("source") == "toyota_pack":
        return toyota.fallback_text(user)
    parts = [f"{i['label']}: {i['status']}. {i['explanation']}" for i in finance.health_indicators(user)]
    return ("Flux could not reach the AI just now, so here is your snapshot from the numbers. "
            + " ".join(parts))


def coach_reply(user: dict, message: str):
    """Returns (text, source, tools_used)."""
    trace: list[str] = []
    prompt = TOYOTA_PROMPT if user.get("source") == "toyota_pack" else COACH_PROMPT
    result = llm.run_chain(message, prompt.format(name=user["name"]), make_tools(user, trace))
    tools_used = list(dict.fromkeys(trace))
    if result is None:
        return health_fallback(user), "fallback_health", tools_used
    return result[0], result[1], tools_used
