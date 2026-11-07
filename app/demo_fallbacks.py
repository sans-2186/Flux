"""Canned education answers when Gemini is overloaded (hackathon / presentation safe)."""
from __future__ import annotations

# (keywords in user message, answer) — first match wins
_ENTRIES: list[tuple[tuple[str, ...], str]] = [
    (
        ("ira", "roth ira", "traditional ira"),
        "An IRA is a retirement account you open yourself, separate from a job 401(k). "
        "You put money in, it can grow over time, and you usually get a tax break either now "
        "or when you take the money out in retirement. A Roth IRA is funded with money you "
        "already paid tax on; withdrawals in retirement can be tax-free if you follow the rules. "
        "For most students and early-career folks, starting small and staying consistent matters "
        "more than picking the perfect account on day one.",
    ),
    (
        ("interest rate", "interest rates", "apr", "apy"),
        "An interest rate is the price of borrowing money or the reward for saving it. "
        "If you borrow, a higher rate means you pay more over time. If you save, APY tells you "
        "how much your balance can grow in a year including compounding. "
        "Credit cards often charge high rates, so carrying a balance gets expensive fast. "
        "Savings accounts usually pay a much lower rate, but your emergency fund still belongs there.",
    ),
    (
        ("credit score", "credit utilization"),
        "Your credit score is a snapshot of how you've handled borrowed money. "
        "Paying on time and keeping card balances well below your limit helps the most. "
        "Utilization means how much of your credit limit you're using; under about thirty percent "
        "is a common target. You do not need debt to build credit, but you do need a track record "
        "of paying bills reliably.",
    ),
    (
        ("emergency fund", "emergency savings"),
        "An emergency fund is cash you can grab quickly for surprises like medical bills or car repairs. "
        "A common target is three to six months of must-pay expenses, but any starter amount beats zero. "
        "Keep it in a savings account, not invested, so it is there when you need it. "
        "Building it slowly with automatic transfers is totally fine.",
    ),
    (
        ("budget", "budgeting"),
        "A budget is just a plan for where your money goes before you spend it. "
        "List income, fixed bills like rent, then flexible stuff like food and fun. "
        "You are not punishing yourself; you are deciding what matters so guilt drops. "
        "Revisit it monthly because life and paychecks change.",
    ),
]


def lookup(message: str) -> str | None:
    m = message.lower()
    for keys, answer in _ENTRIES:
        if any(k in m for k in keys):
            return answer
    return None


GENERIC_BUSY = (
    "Flux could not reach the AI servers just now because demand is high. "
    "Here is the gist: break your question into one specific money topic, like saving, "
    "debt, or retirement accounts, and ask again in a few seconds. "
    "You can also try a shorter question. "
    "Our math and profile tools will always use real formulas, not guesses, when those are wired up."
)
