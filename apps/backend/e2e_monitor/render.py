"""PDF render move + a non-blank heuristic that does not need a browser.

The decision is split into a pure ``_verdict`` (unit-tested for every signal
combination) and a ``check_pdf_bytes`` wrapper that runs an optional ``pypdf``
text/page probe — present only with the ``e2e-monitor`` extra, and degrading to
header+size checks when absent. The render HTTP move is added in a later task.
"""

from __future__ import annotations

from typing import Any

import httpx

from e2e_monitor import API_BASE

_MIN_BYTES = 1000  # a real one-page resume PDF is comfortably larger than this


def _verdict(*, is_pdf: bool, size: int, pages: int | None, has_text: bool | None) -> bool:
    """Pure non-blank decision. ``pages``/``has_text`` may be ``None`` when the
    optional probe is unavailable — ``None`` must not veto an otherwise-real PDF."""
    return bool(is_pdf and size >= _MIN_BYTES and has_text is not False and pages != 0)


def check_pdf_bytes(data: bytes) -> dict[str, Any]:
    """Classify PDF bytes. ``non_blank`` is the load-bearing verdict."""
    is_pdf = data[:5] == b"%PDF-"
    size = len(data)
    pages: int | None = None
    has_text: bool | None = None

    if is_pdf:
        try:
            import io

            from pypdf import PdfReader  # only present with the e2e-monitor extra

            reader = PdfReader(io.BytesIO(data))
            pages = len(reader.pages)
            has_text = any((p.extract_text() or "").strip() for p in reader.pages)
        except ModuleNotFoundError:
            pages = None
            has_text = None  # probe unavailable; fall back to header+size
        except Exception:
            pages = 0
            has_text = False

    return {
        "is_pdf": is_pdf,
        "size": size,
        "pages": pages,
        "has_text": has_text,
        "non_blank": _verdict(is_pdf=is_pdf, size=size, pages=pages, has_text=has_text),
    }


def render_variation(
    tailored_resume_id: str, *, lang: str | None = None
) -> tuple[bytes, dict[str, Any]]:
    """GET the PDF for a tailored resume; return (bytes, non-blank verdict)."""
    params: dict[str, str] = {"template": "swiss-single", "pageSize": "A4"}
    if lang:
        params["lang"] = lang
    resp = httpx.get(
        f"{API_BASE}/resumes/{tailored_resume_id}/pdf", params=params, timeout=120
    )
    resp.raise_for_status()
    return resp.content, check_pdf_bytes(resp.content)
