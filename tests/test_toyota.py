"""Toyota pack: numbers trace to the CSVs, guardrails hold, and the judges' answer key stays reachable."""
import copy
import csv

import pytest

from app import toyota

DIR = toyota.DIR


def csv_rows(name):
    with open(DIR / name, newline="") as fh:
        return list(csv.DictReader(fh))


GOLD = {r["customer_id"]: r for r in csv_rows("golden_answers.csv")}
STEP = {"Offer": "Eligible offer", "Self-service": "Self-service", "Follow-up": "Follow-up"}


def user(cid):
    return toyota.get_user("TY-" + cid)


def ids(result):
    return {o["option_id"] for o in result["options"]}


def test_twenty_customers_with_prefixed_ids():
    assert len(toyota.list_users()) == 20
    assert toyota.get_user("TY-C001")["name"] == "Maya"
    assert toyota.get_user("C001") is None


def test_contract_facts_match_csv():
    acc = {a["customer_id"]: a for a in csv_rows("accounts.csv")}
    for cid in ("C001", "C003", "C014"):
        facts = toyota.next_move_options(user(cid))["contract"]
        assert facts["monthly_payment"] == float(acc[cid]["monthly_payment"])
        assert facts["est_equity"] == float(acc[cid]["est_equity"])
        assert facts["months_remaining"] == int(acc[cid]["months_remaining"])


def test_option_numbers_come_straight_from_the_pack():
    refi = next(o for o in toyota.next_move_options(user("C001"))["options"] if o["option_id"] == "REFI")
    assert refi["new_monthly_payment"] == 611.66 and refi["total_cost_vs_keep_as_is"] == -2444.62
    assert "7.70%" in refi["summary"] and refi["next_step_type"] == "Eligible offer"


@pytest.mark.parametrize("cid", sorted(GOLD))
def test_golden_best_move_is_reachable_with_matching_step_type(cid):
    g = GOLD[cid]
    opts = {o["option_id"]: o for o in toyota.next_move_options(user(cid))["options"]}
    assert g["offer_id"] in opts, f"{cid}: guardrails removed the judges' best move"
    assert opts[g["offer_id"]]["status"] != "not_eligible"
    assert opts[g["offer_id"]]["next_step_type"] == STEP[g["next_step_type"]]


UPSELL = {"REFI", "EXTEND", "TRADE", "BUYOUT", "RENEW"}


@pytest.mark.parametrize("cid", ["C002", "C011", "C014", "C016"])
def test_vulnerable_customers_get_no_upsell_but_do_get_a_human_option(cid):
    r = toyota.next_move_options(user(cid))
    assert r["guardrails"]["upsell_allowed"] is False
    assert "HUMAN" in ids(r)
    assert not ids(r) & UPSELL


@pytest.mark.parametrize("cid", ["C002", "C011", "C014", "C016"])
def test_no_extra_payment_suggestions_for_distressed_customers(cid):
    assert "EXTRA100" not in ids(toyota.next_move_options(user(cid)))


def test_non_vulnerable_customer_keeps_upsell_options():
    r = toyota.next_move_options(user("C001"))
    assert r["guardrails"]["upsell_allowed"] is True and {"REFI", "TRADE"} <= ids(r)


def test_two_missed_payments_block_upsell_even_if_not_flagged():
    u = copy.deepcopy(user("C001"))
    u["account"]["missed_payments_12m"] = 2
    r = toyota.next_move_options(u)
    assert r["guardrails"]["must_offer_human"] and "HUMAN" in ids(r)
    assert not ids(r) & {"REFI", "TRADE"}


def test_no_marketing_consent_hides_new_vehicle_offers_only():
    u = copy.deepcopy(user("C001"))
    u["customer"]["marketing_consent"] = "N"
    r = toyota.next_move_options(u)
    assert "TRADE" not in ids(r) and "REFI" in ids(r)
    lease = copy.deepcopy(user("C006"))
    lease["customer"]["marketing_consent"] = "N"
    r = toyota.next_move_options(lease)
    assert "RENEW" not in ids(r) and "BUYOUT" in ids(r)


def test_not_eligible_options_are_listed_with_reasons_and_never_offered():
    r = toyota.next_move_options(user("C009"))
    refi = next(o for o in r["not_eligible"] if o["option_id"] == "REFI")
    assert refi["eligibility_detail"] == "N (new rate not meaningfully lower)"
    assert "REFI" not in ids(r)
    assert all(o["status"] != "not_eligible" for o in r["options"])


def test_withheld_offers_leave_no_trace_for_vulnerable_customers():
    r = toyota.next_move_options(user("C011"))
    assert not {o["option_id"] for o in r["not_eligible"]} & UPSELL


def test_short_loans_get_a_timing_note_on_trade_in():
    trade = next(o for o in toyota.next_move_options(user("C020"))["options"] if o["option_id"] == "TRADE")
    assert "Do not push" in trade["timing_note"]
    c4 = next(o for o in toyota.next_move_options(user("C004"))["options"] if o["option_id"] == "TRADE")
    assert "timing_note" not in c4


def test_synthesized_options_only_when_the_data_calls_for_them():
    c5 = toyota.next_move_options(user("C005"))
    assert "AUTOPAY" in ids(c5)
    c3 = toyota.next_move_options(user("C003"))
    assert not ids(c3) & {"AUTOPAY", "PAYOFF"}
    payoff = next(o for o in c5["options"] if o["option_id"] == "PAYOFF")
    assert "$4,434.80" in payoff["summary"]


def test_vehicle_flags_use_the_pack_date():
    veh = toyota.next_move_options(user("C009"))["vehicle"]
    assert veh["open_recall"] is True
    assert toyota.next_move_options(user("C001"))["vehicle"]["toyota_care_ended"] is True


@pytest.mark.parametrize("cid,makes_sense,step", [
    ("C004", True, "Eligible offer"),
    ("C007", True, "Eligible offer"),
    ("C005", False, "Self-service"),
    ("C020", False, "Self-service"),
    ("C011", False, "Follow-up"),
    ("C014", False, "Follow-up"),
    ("C016", False, "Follow-up"),
    ("C012", False, "Self-service"),
    ("C001", False, "Self-service"),
])
def test_trade_in_check(cid, makes_sense, step):
    r = toyota.trade_in_check(user(cid))
    assert r["makes_sense_now"] is makes_sense and r["next_step"]["type"] == step
    est = {a["customer_id"]: float(a["est_equity"]) for a in csv_rows("accounts.csv")}
    assert r["estimated_equity"] == est[cid]


def test_trade_in_does_not_apply_to_leases():
    r = toyota.trade_in_check(user("C003"))
    assert r["applies"] is False and r["estimated_equity"] == 1930.0


def test_loan_equity_in_pack_equals_value_minus_balance():
    for cid, acc in {a["customer_id"]: a for a in csv_rows("accounts.csv")}.items():
        if acc["contract_type"] == "loan":
            veh = user(cid)["vehicle"]
            assert float(acc["est_equity"]) == pytest.approx(
                veh["est_market_value_now"] - float(acc["current_balance"]), abs=0.02)


def test_fallback_text_respects_guardrails():
    assert "specialist" in toyota.fallback_text(user("C014")).lower()
    text = toyota.fallback_text(user("C001"))
    assert "Refinance" in text and "Next step" in text
