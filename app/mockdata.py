"""Load PNC's synthetic dataset (mock/pnc/*.csv) plus mock/people.json into Flux user records.

Every money number is computed from the accounts and the 24-month ledger: nothing is guessed.
PNC's data has no names, ages, goals or vehicles; those come from mock/people.json (MOCK).
Customer ids (C001..C030) are the user_ids for /health and /chat.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "mock"
WINDOW_MONTHS = 12
_users = None


def _rows(name):
    with open(DIR / "pnc" / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _build():
    people = json.loads((DIR / "people.json").read_text(encoding="utf-8"))["people"]
    profiles = {p["customer_id"]: p for p in _rows("profiles.csv")}
    accounts = defaultdict(list)
    for a in _rows("accounts.csv"):
        accounts[a["customer_id"]].append(a)

    paychecks = defaultdict(lambda: defaultdict(float))
    spending = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    ira_in = defaultdict(lambda: defaultdict(float))
    for t in _rows("transactions.csv"):
        c, month, amt = t["customer_id"], t["posted_date"][:7], float(t["amount"])
        if t["transaction_type"] == "paycheck":
            paychecks[c][month] += amt
        if t["flow_class"] == "expense":
            spending[c][month][t["category"]] += amt
        if t["account_type"] == "ira" and t["transaction_type"] in ("deposit", "deposit_rounding"):
            ira_in[c][month] += amt

    users = {}
    for cid, prof in profiles.items():
        accts = {}
        for a in accounts[cid]:
            accts.setdefault(a["account_type"], a)
        months = sorted(spending[cid])
        window = months[-WINDOW_MONTHS:]
        spend_avg = {}
        for m in window:
            for cat, amt in spending[cid][m].items():
                spend_avg[cat] = spend_avg.get(cat, 0) + amt / len(window)
        spend_avg = {k: round(v, 2) for k, v in sorted(spend_avg.items(), key=lambda kv: -kv[1])}
        person = people[cid]

        vehicle = None
        if "auto_loan" in accts and "vehicle" in person:
            loan = accts["auto_loan"]
            vehicle = {**person["vehicle"], "loan_balance": float(loan["balance"]),
                       "monthly_payment": float(loan["monthly_payment"])}
        debts = [{"name": label, "balance": float(accts[k]["balance"]),
                  "monthly_payment": float(accts[k]["monthly_payment"]), "apr_pct": float(accts[k]["apr_pct"])}
                 for k, label in (("personal_loan", "Personal loan"), ("mortgage", "Mortgage")) if k in accts]
        card = accts["credit_card"]
        ira = accts["ira"]

        users[cid] = {
            "user_id": cid, "source": "pnc_mock", "name": person["name"], "age": person["age"],
            "goals": person["goals"],
            "monthly_income": round(sum(paychecks[cid][m] for m in window) / len(window), 2),
            "monthly_expenses": round(sum(spend_avg.values()), 2),
            "savings": round(float(accts["checking"]["balance"]) + float(accts["savings"]["balance"]), 2),
            "debts": debts,
            "credit_card_balance": float(card["balance"]),
            "credit_limit": float(prof["credit_limit"]),
            "credit_card_payment": float(card["monthly_payment"]),
            "vehicle": vehicle,
            "retirement": {"balance": float(ira["balance"]),
                           "monthly_contribution": round(sum(ira_in[cid][m] for m in window) / len(window), 2),
                           "annual_return_pct": float(ira["annual_yield_pct"])},
            "spending_by_category": spend_avg,
            "spending_history": {m: {k: round(v, 2) for k, v in spending[cid][m].items()} for m in months},
            "data_window": f"{window[0]} to {window[-1]}",
        }
    return users


def all_users():
    global _users
    if _users is None:
        _users = _build()
    return _users


def get_user(user_id):
    return all_users().get(user_id)


def list_users():
    return [{"user_id": u["user_id"], "name": u["name"], "age": u["age"], "goals": u["goals"],
             "has_vehicle": u["vehicle"] is not None}
            for u in all_users().values()]
