"""Redact API-key-like text from error details and from every log record.

Provider errors can echo the API key back (OpenAI's "Incorrect API key provided:
sk-proj-..."), and routes log exception text server-side, so a key could reach the
log. LiteLLM filters a few library loggers (httpx, uvicorn), not the app's own.
``install_log_redaction`` redacts every record created in the process instead.
"""

import logging
import re
import traceback
from collections.abc import Mapping
from typing import Any

CREDENTIAL_PATTERNS: tuple[re.Pattern[str], ...] = (
    # sk-<anything-non-whitespace>, covering both plain and already-masked
    # tokens (e.g., ``sk-ant-a****...7QAA``). Minimum length of 12 avoids
    # matching harmless substrings like ``sk-foo``.
    re.compile(r"sk-[A-Za-z0-9_\-*.]{12,}"),
    # Google AI Studio.
    re.compile(r"AIza[0-9A-Za-z_\-]{10,}"),
    # Generic Bearer tokens in an Authorization header line.
    re.compile(r"(?i)(Bearer\s+)[^\s\"']+"),
    # Azure sends its key in a bare ``api-key:`` header and the value is a plain
    # 32-84 char alphanumeric, so it matches none of the patterns above. M-08.
    re.compile(r"(?i)(api[-_]?key[\"'\s:=]+)[^\s\"',}]+"),
)

REDACTED = "<redacted>"


def redact_credentials(text: str) -> str:
    """Replace API-key-like substrings in ``text`` with ``<redacted>``."""
    if not text:
        return text
    for pattern in CREDENTIAL_PATTERNS:
        text = pattern.sub(REDACTED, text)
    return text


def _redact_value(value: Any) -> Any:
    """A log argument with credentials redacted; untouched if it has none."""
    if isinstance(value, str):
        return redact_credentials(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    try:
        text = str(value)
    except Exception:
        # Formatting may use repr(); if the record still shows a credential,
        # _redact_message flattens it.
        return value
    redacted = redact_credentials(text)
    return value if redacted == text else redacted


def _redact_message(record: logging.LogRecord) -> None:
    """Redact the record's message, keeping its arguments' shape when possible.

    Some formatters read ``record.args`` directly (uvicorn's AccessFormatter
    unpacks its five request fields), so a record with no credential is left
    alone, and one with a credential has its template and each argument redacted
    in place. Only a credential split between the template and an argument
    ("api-key: %s") flattens the record into one redacted string.
    """
    try:
        message = record.getMessage()
    except Exception:
        # A malformed format string: leave it for logging's own error report.
        return
    if redact_credentials(message) == message:
        return
    if isinstance(record.msg, str):
        record.msg = redact_credentials(record.msg)
    if isinstance(record.args, tuple):
        record.args = tuple(_redact_value(value) for value in record.args)
    elif isinstance(record.args, Mapping):
        record.args = {key: _redact_value(value) for key, value in record.args.items()}
    try:
        rebuilt = record.getMessage()
    except Exception:
        rebuilt = None
    if rebuilt is None or redact_credentials(rebuilt) != rebuilt:
        record.msg = redact_credentials(message)
        record.args = None


def install_log_redaction() -> None:
    """Redact the message, traceback and stack of every log record. Idempotent."""
    previous = logging.getLogRecordFactory()
    if getattr(previous, "redacts_credentials", False):
        return

    def make_record(*args: Any, **kwargs: Any) -> logging.LogRecord:
        record = previous(*args, **kwargs)
        _redact_message(record)
        if record.exc_info and record.exc_info[1] is not None:
            # Formatters reuse a preset exc_text instead of formatting the traceback.
            record.exc_text = redact_credentials(
                "".join(traceback.format_exception(*record.exc_info)).rstrip("\n")
            )
        if record.stack_info:
            record.stack_info = redact_credentials(record.stack_info)
        return record

    make_record.redacts_credentials = True  # type: ignore[attr-defined]
    logging.setLogRecordFactory(make_record)
