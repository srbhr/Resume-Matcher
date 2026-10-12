"""The PDF preflight must accept what the text extractor can read, and never hang."""

import threading
import zlib
from collections.abc import Callable
from typing import Any

import pytest
from pdfminer.pdfdocument import PDFPasswordIncorrect

from app.services import parser
from app.services.parser import (
    DocumentPasswordError,
    DocumentValidationError,
    _decode_flate_bounded,
    _parse_document_sync,
)
from tests.pdf_samples import (
    SAMPLE_TEXT,
    missing_object_pdf,
    trailing_byte_pdf,
    truncated_flate_pdf,
)

LIMIT = 16 * 1024 * 1024


def _run_with_deadline(work: Callable[[], Any], seconds: float = 10.0) -> Any:
    """Run ``work`` in a daemon thread so a regression fails instead of hanging."""
    result: dict[str, Any] = {}

    def target() -> None:
        try:
            result["value"] = work()
        except BaseException as exc:  # surfaced to the test below
            result["error"] = exc

    thread = threading.Thread(target=target, daemon=True)
    thread.start()
    thread.join(seconds)
    assert not thread.is_alive(), "decoder did not finish (infinite loop)"
    if "error" in result:
        raise result["error"]
    return result["value"]


def test_flate_with_bytes_after_the_zlib_data_terminates() -> None:
    payload = b"q Q\n" * 25_000  # inflates past one 64 KB output chunk
    data = zlib.compress(payload) + b"\n"
    assert _run_with_deadline(lambda: _decode_flate_bounded(data, LIMIT)) == payload


def test_truncated_flate_keeps_the_decoded_prefix() -> None:
    payload = b"BT (hello) Tj ET"
    assert _decode_flate_bounded(zlib.compress(payload)[:-4], LIMIT) == payload


def test_corrupt_flate_does_not_raise() -> None:
    assert _decode_flate_bounded(b"not zlib at all", LIMIT) == b""


@pytest.mark.parametrize(
    "build", [trailing_byte_pdf, truncated_flate_pdf, missing_object_pdf]
)
def test_readable_pdfs_with_common_defects_are_converted(
    build: Callable[[], bytes],
) -> None:
    text = _run_with_deadline(lambda: _parse_document_sync(build(), "resume.pdf"))
    assert SAMPLE_TEXT in text


def test_password_protected_pdf_raises_a_specific_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def locked(*_args: object, **_kwargs: object) -> None:
        raise PDFPasswordIncorrect()

    monkeypatch.setattr(parser, "PDFDocument", locked)
    with pytest.raises(DocumentPasswordError) as raised:
        _parse_document_sync(missing_object_pdf(), "resume.pdf")
    # Still a validation error, so existing callers keep handling it.
    assert isinstance(raised.value, DocumentValidationError)
