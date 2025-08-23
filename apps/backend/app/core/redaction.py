"""Utilities for PII redaction in logs.

Lightweight regex-based masking for emails and phone numbers to avoid
accidental leakage of personal information in structured logs.
"""
from __future__ import annotations

import re
from typing import Any

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:(?:\+|00)\d{1,3}[- ]?)?(?:\d[ -]?){6,14}\d")

def redact(value: str) -> str:
    if not value:
        return value
    out = EMAIL_RE.sub("<email:redacted>", value)
    out = PHONE_RE.sub("<phone:redacted>", out)
    return out

def redact_kv(data: dict[str, Any]) -> dict[str, Any]:
    return {k: (redact(v) if isinstance(v, str) else v) for k, v in data.items()}
