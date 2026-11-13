"""Credentials never reach a log line, whichever module logs them.

Routes log exception text server-side (coding-standards.md: ``logger.error(f"...: {e}")``),
and provider errors can echo the API key back, e.g. OpenAI's "Incorrect API key
provided: sk-proj-...". Importing ``app`` redacts every log record centrally.
"""

import io
import logging
from collections.abc import Iterator

import pytest

import app  # noqa: F401  (installs the redaction)

KEY = "sk-proj-abcdef1234567890XYZ"


@pytest.fixture
def log_output() -> Iterator[tuple[logging.Logger, io.StringIO]]:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(name)s %(message)s"))
    logger = logging.getLogger("test.log_redaction")
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    yield logger, stream
    logger.removeHandler(handler)


def test_a_key_in_a_logged_exception_message_is_redacted(
    log_output: tuple[logging.Logger, io.StringIO],
) -> None:
    logger, stream = log_output
    error = RuntimeError(f"Incorrect API key provided: {KEY}")

    logger.error("Outreach message generation failed: %s", error)
    logger.error(f"Cover letter generation failed: {error}")

    output = stream.getvalue()
    assert KEY not in output
    assert output.count("<redacted>") == 2
    assert "Outreach message generation failed" in output


def test_a_key_in_a_logged_traceback_is_redacted(
    log_output: tuple[logging.Logger, io.StringIO],
) -> None:
    logger, stream = log_output
    try:
        raise RuntimeError(f"401 from provider, Authorization: Bearer {KEY}")
    except RuntimeError:
        logger.exception("Draft failed")

    output = stream.getvalue()
    assert "Traceback" in output
    assert KEY not in output


def test_a_route_logger_is_redacted() -> None:
    # LiteLLM filters some library loggers (httpx, uvicorn); the app's own route
    # loggers, which log provider errors, have no such filter.
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    route_logger = logging.getLogger("app.routers.resumes")
    level = route_logger.level
    route_logger.addHandler(handler)
    route_logger.setLevel(logging.ERROR)
    try:
        route_logger.error("Outreach message generation failed: %s", f"api-key: {KEY}")
    finally:
        route_logger.removeHandler(handler)
        route_logger.setLevel(level)

    assert "Outreach message generation failed" in stream.getvalue()
    assert KEY not in stream.getvalue()


def test_ordinary_messages_are_unchanged(
    log_output: tuple[logging.Logger, io.StringIO],
) -> None:
    logger, stream = log_output

    logger.info("Rendered %d pages for %s", 3, "resume-1")

    assert stream.getvalue() == "test.log_redaction Rendered 3 pages for resume-1\n"
