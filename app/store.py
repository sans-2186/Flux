"""User lookup: PNC mock customers (C001..), Toyota pack customers (TY-C001..), and users added via /onboard.

Onboarded users live in memory, mirrored to a JSON file (default data/users.json).
"""
import json
import os
import uuid
from pathlib import Path

from app import mockdata, toyota

_users = None


def _path():
    return Path(os.getenv("FLUX_DATA_FILE", "data/users.json"))


def _load():
    global _users
    if _users is None:
        p = _path()
        _users = json.loads(p.read_text()) if p.exists() else {}
    return _users


def add_user(record):
    users = _load()
    record["user_id"] = "u_" + uuid.uuid4().hex[:8]
    record["source"] = "form"
    users[record["user_id"]] = record
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(users, indent=2), encoding="utf-8")
    return record["user_id"]


def get_user(user_id):
    return _load().get(user_id) or mockdata.get_user(user_id) or toyota.get_user(user_id)
