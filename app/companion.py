"""In-memory shopping-companion session.

The Flux UI POSTs the compare-path numbers here; the Chrome extension on a Toyota
listing GETs them so the popup can show the same snapshot without an iframe
(HTTPS dealer pages cannot load http://localhost).
"""
from __future__ import annotations

_session = None


def reset():
    global _session
    _session = None


def save(record: dict) -> dict:
    global _session
    _session = dict(record)
    return _session


def load() -> dict | None:
    return _session
