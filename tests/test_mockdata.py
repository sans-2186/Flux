"""The PNC mock customers: every number must trace back to mock/pnc/*.csv."""
import csv
from collections import defaultdict

import pytest

from app import finance as f
from app import mockdata

DIR = mockdata.DIR / "pnc"


def csv_rows(name):
    with open(DIR / name, newline="") as fh:
        return list(csv.DictReader(fh))


ACCOUNTS = defaultdict(list)
for a in csv_rows("accounts.csv"):
    ACCOUNTS[a["customer_id"]].append(a)
PROFILES = {p["customer_id"]: p for p in csv_rows("profiles.csv")}


def test_thirty_customers_loaded():
    assert len(mockdata.all_users()) == 30
    assert mockdata.get_user("C001")["source"] == "pnc_mock"
    assert mockdata.get_user("C999") is None


@pytest.mark.parametrize("cid", ["C001", "C002", "C005", "C030"])
def test_balances_and_payments_match_csv(cid):
    u = mockdata.get_user(cid)
    rows = ACCOUNTS[cid]
    liquid = sum(float(a["balance"]) for a in rows if a["account_type"] in ("checking", "savings"))
    assert u["savings"] == pytest.approx(liquid, abs=0.01)
    scheduled = sum(float(a["monthly_payment"]) for a in rows)
    assert f.monthly_debt_payments(u) == pytest.approx(scheduled, abs=0.01)
    assert u["credit_limit"] == float(PROFILES[cid]["credit_limit"])
    ira = next(a for a in rows if a["account_type"] == "ira")
    assert u["retirement"]["balance"] == float(ira["balance"])
    assert u["retirement"]["annual_return_pct"] == float(ira["annual_yield_pct"])


def test_ledger_income_and_expenses_close_to_profile_snapshot():
    for cid, u in mockdata.all_users().items():
        p = PROFILES[cid]
        assert u["monthly_income"] == pytest.approx(float(p["monthly_income"]), rel=0.05), cid
        assert u["monthly_expenses"] == pytest.approx(float(p["monthly_non_debt_expenses"]), rel=0.05), cid


def test_vehicles_only_for_auto_loan_holders_with_csv_loan_balance():
    for cid, u in mockdata.all_users().items():
        loan = next((a for a in ACCOUNTS[cid] if a["account_type"] == "auto_loan"), None)
        assert (u["vehicle"] is not None) == (loan is not None), cid
        if loan:
            assert u["vehicle"]["loan_balance"] == float(loan["balance"])
            assert u["vehicle"]["monthly_payment"] == float(loan["monthly_payment"])
            assert u["vehicle"]["make"] == "Toyota"


def test_every_customer_gets_four_indicators_and_a_consistent_budget():
    for cid, u in mockdata.all_users().items():
        ind = f.health_indicators(u)
        assert len(ind) == 4 and all(i["status"] in ("good", "ok", "risk") for i in ind), cid
        b = f.generate_budget(u)
        assert b["basis"] == "ledger_last_12_months"
        assert b["total"] == pytest.approx(u["monthly_income"] + b["shortfall"], abs=0.02), cid


def test_retirement_for_mock_customer_reads_records_and_asks_nothing_else():
    u = mockdata.get_user("C002")
    r = f.retirement_check(u, 50, 90000)
    assert r["inputs"]["current_savings"]["source"] == "the user's records"
    assert r["inputs"]["annual_return_pct"]["value"] == 3.5
    assert "missing_inputs" not in r and r["on_track"] is False


def test_trade_in_demo_covers_all_three_next_steps():
    steps = {f.trade_in_check(u)["next_step"]["type"]
             for u in mockdata.all_users().values() if u["vehicle"]}
    assert steps == {"self_service", "follow_up", "eligible_offer"}


def test_spending_breakdown_matches_ledger_window():
    u = mockdata.get_user("C002")
    r = f.spending_breakdown(u, 3)
    assert r["period"] == "2026-08 to 2026-10"
    assert r["monthly_average_total"] == pytest.approx(
        sum(sum(u["spending_history"][m].values()) for m in ("2026-08", "2026-09", "2026-10")) / 3, abs=0.01)
