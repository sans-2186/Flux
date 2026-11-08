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


def test_card_minimum_payment_added():
    u = user(credit_card_balance=1000.0, credit_limit=4000.0)
    assert f.monthly_debt_payments(u) == 225.0


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


def test_retirement_not_on_track():
    r = f.retirement_check(USER, target_age=50, annual_income=90000, current_savings=4000)
    assert r["on_track"] is False
    assert r["needed_balance"] == 1_800_000.0
    assert r["years_to_go"] == 28
    assert 700_000 < r["projected_balance"] < 900_000
    assert r["monthly_contribution_needed"] > r["monthly_contribution_assumed"]
    assert len(r["assumptions"]) >= 5


def test_retirement_exact_formula_zero_return():
    r = f.retirement_check(USER, target_age=32, annual_income=60000, current_savings=1000,
                           contribution_rate=0.10, real_return=0.0)
    assert r["projected_balance"] == 1000 + 6000 * 10


def test_retirement_on_track():
    r = f.retirement_check(USER, target_age=65, annual_income=60000, current_savings=200000)
    assert r["on_track"] is True and r["shortfall"] == 0


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


def test_credit_utilization_risk():
    u = user(credit_card_balance=3500.0, credit_limit=4000.0)
    ind = {i["id"]: i for i in f.health_indicators(u)}
    assert ind["credit_utilization"]["value"] == 0.875
    assert ind["credit_utilization"]["status"] == "risk"


def test_budget_sums_to_income():
    b = f.generate_budget(USER)
    assert b["total"] == 3000.0 and not b["over_budget"]
    assert b["categories"]["debt_payments"] == 200.0
    assert b["categories"]["savings"] == 600.0


def test_budget_over_budget_flag():
    b = f.generate_budget(user(debts=[{"name": "x", "balance": 1, "monthly_payment": 5000.0}]))
    assert b["over_budget"] is True


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
