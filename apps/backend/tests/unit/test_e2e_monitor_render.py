"""Offline tests for the non-blank PDF heuristic.

The decision logic (``_verdict``) is tested directly so it is deterministic
regardless of whether the optional ``pypdf`` probe is installed; the
``check_pdf_bytes`` smoke cases only assert pypdf-independent facts.
"""

from __future__ import annotations

from e2e_monitor.render import _verdict, check_pdf_bytes


def test_verdict_true_for_real_pdf_signals() -> None:
    assert _verdict(is_pdf=True, size=2000, pages=1, has_text=True) is True
    # probe unavailable (pypdf absent) -> pages/has_text None must not veto a real, large PDF
    assert _verdict(is_pdf=True, size=2000, pages=None, has_text=None) is True


def test_verdict_false_for_blank_or_broken() -> None:
    assert _verdict(is_pdf=False, size=5000, pages=None, has_text=None) is False  # not a pdf
    assert _verdict(is_pdf=True, size=100, pages=1, has_text=True) is False        # too small
    assert _verdict(is_pdf=True, size=5000, pages=1, has_text=False) is False      # no text
    assert _verdict(is_pdf=True, size=5000, pages=0, has_text=None) is False       # zero pages


def test_check_pdf_bytes_rejects_empty() -> None:
    r = check_pdf_bytes(b"")
    assert r["is_pdf"] is False
    assert r["non_blank"] is False


def test_check_pdf_bytes_rejects_non_pdf() -> None:
    r = check_pdf_bytes(b"<html>not a pdf</html>")
    assert r["is_pdf"] is False
    assert r["non_blank"] is False


def test_check_pdf_bytes_reads_header_and_size() -> None:
    r = check_pdf_bytes(b"%PDF-1.4\n" + b"x" * 2000)
    assert r["is_pdf"] is True
    assert r["size"] >= 1000
    # non_blank here depends on whether pypdf is installed to parse this
    # non-structured blob; the _verdict tests cover the decision deterministically.
