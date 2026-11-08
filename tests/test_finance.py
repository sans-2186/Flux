"""Tests for the deterministic math: affordability, retirement, trade-in equity, health, budget."""
import pytest

from app import finance as f

USER = {"name": "Sam", "age": 22, "monthly_income": 3000.0, "monthly_expenses": 2000.0,
        "savings": 4000.0, "debts": [{"name": "student loan", "balance": 12000.0, "monthly_payment": 200.0}],
        "credit_card_balance": 0.0, "credit_limit": 0.0, "goals": [], "vehicle": None}


def user(**kw):
    return {**USER, **kw}


def test_surplus_and_debt_payments():
    assert f.monthly_debt_payments(USER) == 200.0
    assert f.monthly_surplus(USER) == 800.0


def test_card_payment_is_only_what_is_recorded():
    u = user(credit_card_balance=1000.0, credit_limit=4000.0)
    assert f.monthly_debt_payments(u) == 200.0
    assert f.monthly_debt_payments({**u, "credit_card_payment": 40.0}) == 240.0


def test_can_afford_small_purchase_yes():
    r = f.can_afford(USER, 300)
    assert r["affordable"] is True
    assert r["months_of_surplus_to_save_up"] == 0.38
    assert r["savings_if_paid_from_savings"] == 3700.0
    assert r["emergency_fund_months_before"] == 1.82


def test_can_afford_more_than_savings_no():
    r = f.can_afford(USER, 5000)
    assert r["affordable"] is False
    assert "total savings" in r["reason"]


def test_can_afford_drains_emergency_fund_no():
    r = f.can_afford(USER, 2500)
    assert r["affordable"] is False


def test_can_afford_rich_user_pays_from_savings_yes():
    r = f.can_afford(user(savings=30000.0), 5000)
    assert r["affordable"] is True and "months of bills" in r["reason"]


RECORDS = {"balance": 65000.0, "monthly_contribution": 180.0, "annual_return_pct": 3.5}


def test_retirement_uses_records_and_user_goal():
    r = f.retirement_check(user(retirement=RECORDS), 50, 90000)
    assert r["on_track"] is False
    assert r["needed_balance"] == pytest.approx(90000 / 0.035, abs=0.01)
    assert r["years_to_go"] == 28
    assert r["inputs"]["current_savings"] == {"value": 65000.0, "source": "the user's records"}
    assert r["inputs"]["annual_income"]["source"] == "provided by the user"
    assert r["monthly_contribution_needed"] > r["monthly_contribution_used"]


def test_retirement_known_value():
    r = f.retirement_check(USER, 23, 6000, current_savings=1000, monthly_contribution=100,
                           annual_return_pct=12)
    assert r["projected_balance"] == pytest.approx(2395.08, abs=0.01)
    assert r["needed_balance"] == 50000.0


def test_retirement_user_values_override_records():
    r = f.retirement_check(user(retirement=RECORDS), 50, 90000, current_savings=1)
    assert r["inputs"]["current_savings"]["source"] == "provided by the user"


def test_retirement_missing_inputs_not_guessed():
    r = f.retirement_check(USER, 50, 90000)
    assert "on_track" not in r
    assert len(r["missing_inputs"]) == 3
    assert any("current_savings" in m for m in r["missing_inputs"])
    assert "annual_income" in f.retirement_check(user(retirement=RECORDS), 50)["missing_inputs"][0]


def test_retirement_without_age_on_record_asks_for_it_instead_of_guessing():
    no_age = {**USER, "age": None}
    r = f.retirement_check(no_age, 65, 40000, 200000, 500, 7)
    assert "on_track" not in r and r["missing_inputs"] == ["current_age (how old you are now)"]


def test_retirement_current_age_from_the_user_gives_the_same_answer_as_age_on_record():
    no_age = {**USER, "age": None}
    given = f.retirement_check(no_age, 65, 40000, 200000, 500, 7, current_age=22)
    assert given == f.retirement_check(USER, 65, 40000, 200000, 500, 7) | {
        "inputs": given["inputs"]}
    assert given["inputs"]["current_age"]["source"] == "provided by the user"


def test_retirement_on_track():
    r = f.retirement_check(USER, 65, 40000, 200000, 500, 7)
    assert r["on_track"] is True and r["shortfall"] == 0


def test_retirement_zero_return_is_an_error_not_a_crash():
    assert "error" in f.retirement_check(USER, 50, 90000, 1000, 100, 0)


def test_trade_in_equity():
    assert f.trade_in_equity(15000, 11000) == 4000
    assert f.trade_in_equity(9000, 12000) == -3000


def car(value, loan):
    return {"make": "Toyota", "model": "Camry", "year": 2020, "value": value,
            "loan_balance": loan, "monthly_payment": 350.0}


def test_trade_in_positive_equity_eligible_offer():
    r = f.trade_in_check(user(vehicle=car(15000, 11000)))
    assert r["estimated_equity"] == 4000 and r["makes_sense_now"] is True
    assert r["next_step"]["type"] == "eligible_offer"


def test_trade_in_negative_equity_follow_up():
    r = f.trade_in_check(user(vehicle=car(9000, 12000)))
    assert r["estimated_equity"] == -3000 and r["makes_sense_now"] is False
    assert r["next_step"]["type"] == "follow_up"


def test_trade_in_small_equity_self_service():
    r = f.trade_in_check(user(vehicle=car(15000, 14000)))
    assert r["makes_sense_now"] is False and r["next_step"]["type"] == "self_service"


def test_trade_in_no_vehicle():
    r = f.trade_in_check(USER)
    assert r["has_vehicle"] is False and r["next_step"]["type"] == "self_service"


def test_health_has_four_indicators_with_valid_status():
    ind = {i["id"]: i for i in f.health_indicators(USER)}
    assert set(ind) == {"savings_rate", "debt_to_income", "emergency_fund_months", "credit_utilization"}
    assert all(i["status"] in ("good", "ok", "risk") and i["explanation"] for i in ind.values())
    assert ind["savings_rate"]["value"] == pytest.approx(0.2667, abs=1e-4)
    assert ind["savings_rate"]["status"] == "good"
    assert ind["debt_to_income"]["value"] == pytest.approx(0.0667, abs=1e-4)
    assert ind["emergency_fund_months"]["value"] == pytest.approx(1.8182, abs=1e-4)
    assert ind["emergency_fund_months"]["status"] == "risk"
    assert ind["credit_utilization"]["status"] == "good"


def test_health_example_from_build_log():
    u = user(monthly_income=3000.0, monthly_expenses=2400.0, debts=[])
    ind = {i["id"]: i for i in f.health_indicators(u)}
    assert ind["savings_rate"]["value"] == 0.2 and ind["savings_rate"]["status"] == "good"


def test_negative_savings_rate_is_explained_plainly():
    ind = {i["id"]: i for i in f.health_indicators(user(monthly_expenses=2850.0))}
    assert ind["savings_rate"]["value"] < 0 and ind["savings_rate"]["status"] == "risk"
    assert "more than you earn" in ind["savings_rate"]["explanation"]
    assert "-" not in ind["savings_rate"]["explanation"]


def test_credit_utilization_risk():
    u = user(credit_card_balance=3500.0, credit_limit=4000.0)
    ind = {i["id"]: i for i in f.health_indicators(u)}
    assert ind["credit_utilization"]["value"] == 0.875
    assert ind["credit_utilization"]["status"] == "risk"


def test_budget_without_ledger_uses_only_typed_numbers():
    b = f.generate_budget(USER)
    assert b["basis"] == "typed_in_expenses"
    assert b["categories"] == {"expenses": 2000.0, "debt_payments": 200.0, "savings": 800.0}
    assert b["total"] == 3000.0 and not b["over_budget"]


def test_budget_uses_ledger_categories_when_available():
    u = user(spending_by_category={"housing": 1200.0, "dining": 300.0}, monthly_expenses=1500.0)
    b = f.generate_budget(u)
    assert b["basis"] == "ledger_last_12_months"
    assert b["categories"]["housing"] == 1200.0 and b["categories"]["savings"] == 1300.0
    assert b["total"] == 3000.0


def test_budget_over_budget_shows_shortfall():
    b = f.generate_budget(user(debts=[{"name": "x", "balance": 1, "monthly_payment": 5000.0}]))
    assert b["over_budget"] is True and b["shortfall"] == 4000.0
    assert b["categories"]["savings"] == 0.0


HIST = {"2026-01": {"housing": 1000.0, "dining": 100.0}, "2026-02": {"housing": 1000.0, "dining": 200.0},
        "2026-03": {"housing": 1000.0, "dining": 300.0}, "2026-04": {"housing": 1000.0, "dining": 300.0}}


def test_spending_breakdown_averages_and_trend():
    r = f.spending_breakdown(user(spending_history=HIST), 2)
    assert r["period"] == "2026-03 to 2026-04" and r["top_category"] == "housing"
    dining = {x["category"]: x for x in r["by_category"]}["dining"]
    assert dining["monthly_average"] == 300.0
    assert dining["change_vs_previous_period_pct"] == 100.0
    assert r["monthly_average_total"] == 1300.0


def test_spending_breakdown_without_history_says_so():
    assert "missing_inputs" in f.spending_breakdown(USER)


def test_forecast_balances():
    r = f.forecast_balances(USER, 3)
    assert r["monthly_net_cash_flow"] == 800.0
    assert [p["cash"] for p in r["projection"]] == [4800.0, 5600.0, 6400.0]
    assert r["goes_negative"] is False


def test_forecast_goes_negative():
    r = f.forecast_balances(user(monthly_expenses=3500.0, savings=1000.0), 6)
    assert r["goes_negative"] is True and r["first_negative_month"] == 2


def test_what_if_cutting_expenses_improves_savings_rate():
    r = f.what_if(USER, monthly_expenses_change=-300)
    row = {x["id"]: x for x in r["indicators"]}["savings_rate"]
    assert row["before"] == pytest.approx(0.2667, abs=1e-4)
    assert row["after"] == pytest.approx(0.3667, abs=1e-4)
    assert r["monthly_surplus_after"] == 1100.0


def test_what_if_does_not_mutate_user():
    before = dict(USER)
    f.what_if(USER, monthly_income_change=-1000, credit_card_balance_change=500)
    assert USER == before
