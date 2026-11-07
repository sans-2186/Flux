"""Tests for the vendored PNC wellness math (adapted from the PNC workshop repo)."""
from wellness.data_gen import generate_customer, generate_dataset
from wellness.forecast import forecast_cash
from wellness.metrics import compute_metrics
from wellness.profile import build_profile
from wellness.scenarios import car_purchase
from wellness.validation import validate

C = generate_customer(1)
P = build_profile(C)


def test_dataset_deterministic():
    assert generate_dataset(2, 5) == generate_dataset(2, 5)


def test_profile_net_worth():
    assert abs(P["net_worth"] - (P["total_assets"] - P["total_liabilities"])) < 0.01


def test_core_metrics_present():
    vals = compute_metrics(P)["values"]
    for k in ("savings_rate", "debt_to_income", "emergency_fund_months", "credit_utilization"):
        assert vals[k] is not None


def test_car_purchase_zero_apr():
    r = car_purchase(P, 30000, 5000, 0.0, 50)
    assert r["monthly_payment"] == 500 and r["loan_amount"] == 25000


def test_forecast_linear():
    fc = forecast_cash(P, 3)
    assert len(fc["projection"]) == 3
    assert round(fc["projection"][2]["cash"] - fc["projection"][1]["cash"], 2) == fc["monthly_net_cash_flow"]


def test_validation_flags_bad():
    assert not validate("simulate_car_purchase", {"loan_amount": -1})[0]
    assert validate("x", {"a": 1})[0]
