import asyncio
import io
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.schemas.models import PageFitSettings
from app.services import page_fit
from app.services.bullet_selector import PageMeasureError
from app.services.page_fit import RenderDraftStore, count_pdf_pages, measure_page_count


def test_draft_store_round_trip_ttl_and_capacity() -> None:
    now = [0.0]
    store = RenderDraftStore(ttl_seconds=10, max_entries=2, clock=lambda: now[0])
    a = store.put({"a": 1})
    assert len(a) == 32 and store.get(a) == {"a": 1}
    b = store.put({"b": 1})
    c = store.put({"c": 1})  # evicts oldest
    assert (
        store.get(a) is None and store.get(b) == {"b": 1} and store.get(c) == {"c": 1}
    )
    now[0] = 11
    assert store.get(b) is None
    store.discard(c)
    assert store.get(c) is None


def test_page_fit_settings_query_matches_pdf_endpoint_params() -> None:
    q = PageFitSettings(compactMode=True, lang="en").to_query()
    assert q["template"] == "swiss-single" and q["pageSize"] == "A4"
    assert q["compactMode"] == "true" and q["showContactIcons"] == "false"
    assert q["marginTop"] == "10" and q["lang"] == "en"
    assert "lang" not in PageFitSettings().to_query()


def _pdf(pages: int) -> bytes:
    # Minimal valid multi-page PDF built by hand; pdfminer only needs the page tree.
    objs = ["<< /Type /Catalog /Pages 2 0 R >>"]
    kids = " ".join(f"{3 + i} 0 R" for i in range(pages))
    objs.append(f"<< /Type /Pages /Kids [{kids}] /Count {pages} >>")
    objs += ["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>"] * pages
    out = io.BytesIO(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(f"{n} 0 obj {body} endobj\n".encode())
    xref = out.tell()
    out.write(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(
        f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    )
    return out.getvalue()


def test_count_pdf_pages() -> None:
    assert count_pdf_pages(_pdf(1)) == 1
    assert count_pdf_pages(_pdf(3)) == 3


async def test_measure_renders_draft_url_and_discards_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    render = AsyncMock(return_value=_pdf(2))
    monkeypatch.setattr(page_fit, "render_resume_pdf", render)
    pages = await measure_page_count(
        {"summary": "x"}, PageFitSettings(pageSize="LETTER", marginLeft=12)
    )
    assert pages == 2
    url = render.call_args.args[0]
    assert "/print/resumes/draft?draft=" in url and "pageSize=LETTER" in url
    assert render.call_args.args[1] == "LETTER"
    assert render.call_args.kwargs["margins"]["left"] == 12
    token = url.split("draft=")[1].split("&")[0]
    assert page_fit.render_drafts.get(token) is None  # discarded after render


async def test_measure_fails_fast_when_the_print_page_reports_a_missing_draft(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A missing/expired draft token must not cost the renderer's 60 s readiness wait."""
    from app.pdf import PDFRenderError

    async def print_page_showing_only_the_error_marker(
        url: str,
        page_size: str = "A4",
        selector: str = ".resume-print",
        margins: Any = None,
    ) -> bytes:
        # The print route renders only [data-print-error] when the draft fetch
        # fails; Playwright resolves the wait only if the selector includes it.
        if "[data-print-error]" in (part.strip() for part in selector.split(",")):
            raise PDFRenderError("The print page could not load the resume.")
        await asyncio.sleep(60)  # waiting for .resume-print until the nav timeout
        return b""

    monkeypatch.setattr(
        page_fit, "render_resume_pdf", print_page_showing_only_the_error_marker
    )
    with pytest.raises(PageMeasureError):
        await asyncio.wait_for(
            measure_page_count({"summary": "x"}, PageFitSettings()), timeout=2
        )


async def test_measure_wraps_render_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.pdf import PDFRenderError

    monkeypatch.setattr(
        page_fit, "render_resume_pdf", AsyncMock(side_effect=PDFRenderError("down"))
    )
    with pytest.raises(PageMeasureError):
        await measure_page_count({"summary": "x"}, PageFitSettings())
