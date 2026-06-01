"""Render smoke tests for app/pdf.py — the 'resume won't render' incident class.

A live demo of Resume-Matcher once broke a YouTuber's stream because PDF
rendering failed. These tests give real coverage to the render path:

* Pure helpers (format/margins) always run — no browser required.
* A real headless-Chromium render proves the happy path actually emits PDF
  bytes (magic header + non-trivial size), not just "no exception".

The real frontend is not available under test, so the render targets a
self-contained ``data:`` URL that already contains the ``.resume-print``
selector. ``networkidle`` and ``wait_for_selector`` both resolve on a static
data: URL, exercising the same goto → wait → page.pdf flow as production.

Real-render tests skip cleanly (never hard-fail) when no Chromium binary can
be launched.
"""

import socket
from unittest.mock import AsyncMock

import pytest
from playwright.async_api import Error as PlaywrightError

from app.pdf import (
    PDFRenderError,
    _raise_playwright_error,
    _render_page_to_pdf,
    _resolve_pdf_format,
    _resolve_pdf_margins,
    close_pdf_renderer,
    render_resume_pdf,
)


# A self-contained page that satisfies wait_for_selector(".resume-print")
# without needing the real frontend running.
RESUME_PRINT_DATA_URL = (
    "data:text/html,"
    "<html><body><div class='resume-print'>Hello PDF</div></body></html>"
)


def _refused_url():
    """Return a URL on a closed, connection-refusing localhost port.

    Bind an ephemeral port to claim a free number, read it, then CLOSE the
    socket: with nothing bound, the kernel answers a connect with RST, so
    Chromium navigation fails fast with net::ERR_CONNECTION_REFUSED — the signal
    this test needs.

    We deliberately close rather than hold the socket bound-but-unlistening:
    that was tried, and on macOS a bound, non-listening socket does NOT refuse —
    the SYN is dropped and Chromium hangs until its 30s navigation timeout (a
    different, slower failure path), so the test would stop exercising
    connection-refused. The residual window between close() and connect() is
    sub-millisecond on a loopback ephemeral port, and a collision would only
    *delay* the same failure, never mask it. (Port 9/discard is on Chromium's
    unsafe-ports blocklist and yields ERR_UNSAFE_PORT, which also doesn't
    exercise this mapping.)
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return f"http://127.0.0.1:{port}/"


async def _render_or_skip(url, **kwargs):
    """Render ``url`` to PDF, or skip the test if Chromium is unavailable.

    Distinguishes "Chromium can't launch" (skip — environment limitation) from
    a genuine render/navigation failure (re-raise — that's the bug we test for).
    A missing-browser failure surfaces as a PDFRenderError mentioning the
    executable, or as a raw PlaywrightError about a missing executable.
    """
    try:
        return await render_resume_pdf(url, **kwargs)
    except PDFRenderError as exc:
        if "executable" in str(exc).lower():
            pytest.skip(f"chromium unavailable: {exc}")
        raise
    except PlaywrightError as exc:
        if "Executable doesn't exist" in str(exc):
            pytest.skip(f"chromium unavailable: {exc}")
        raise
    except NotImplementedError as exc:
        # Subprocess launch unsupported on this event loop policy.
        pytest.skip(f"chromium subprocess launch unsupported: {exc}")


class TestResolvePdfFormat:
    """_resolve_pdf_format — page-size string → Playwright PDF format."""

    def test_a4_maps_to_a4(self):
        assert _resolve_pdf_format("A4") == "A4"

    def test_letter_maps_to_letter(self):
        # Note the case change: input "LETTER" → Playwright's "Letter".
        assert _resolve_pdf_format("LETTER") == "Letter"

    def test_unknown_defaults_to_a4(self):
        assert _resolve_pdf_format("TABLOID") == "A4"

    def test_empty_string_defaults_to_a4(self):
        assert _resolve_pdf_format("") == "A4"


class TestResolvePdfMargins:
    """_resolve_pdf_margins — margin dict → mm-suffixed Playwright margins."""

    def test_none_returns_ten_mm_on_all_sides(self):
        assert _resolve_pdf_margins(None) == {
            "top": "10mm",
            "right": "10mm",
            "bottom": "10mm",
            "left": "10mm",
        }

    def test_empty_dict_falls_back_to_defaults(self):
        # Empty dict is falsy, so it takes the same default path as None.
        assert _resolve_pdf_margins({}) == {
            "top": "10mm",
            "right": "10mm",
            "bottom": "10mm",
            "left": "10mm",
        }

    def test_custom_values_are_formatted_as_mm(self):
        result = _resolve_pdf_margins(
            {"top": 20, "right": 15, "bottom": 25, "left": 5}
        )
        assert result == {
            "top": "20mm",
            "right": "15mm",
            "bottom": "25mm",
            "left": "5mm",
        }

    def test_partial_dict_fills_missing_sides_with_ten(self):
        # Provided keys win; absent keys default to 10mm.
        result = _resolve_pdf_margins({"top": 30})
        assert result == {
            "top": "30mm",
            "right": "10mm",
            "bottom": "10mm",
            "left": "10mm",
        }


class TestRenderPageWaitStrategy:
    """#799/#808: rendering must wait on a deterministic readiness condition
    (document 'load' + the resume content selector + fonts), NOT the
    environment-fragile 'networkidle' that hangs against the Next.js dev server
    (HMR/Turbopack/RSC streaming keep the network busy, so idle never arrives →
    30s timeout → 503). These are browser-free: they mock the Playwright Page.
    """

    async def test_goto_uses_load_with_bounded_timeout(self):
        page = AsyncMock()
        page.pdf.return_value = b"%PDF-1.4 fake"
        await _render_page_to_pdf(page, "http://f/print/r", ".resume-print", "A4", {"top": "10mm"})
        _, goto_kwargs = page.goto.call_args
        assert goto_kwargs.get("wait_until") == "load"
        # An explicit, positive, bounded navigation timeout (not the fragile default).
        timeout = goto_kwargs.get("timeout")
        assert isinstance(timeout, (int, float)) and timeout > 0

    async def test_still_gates_on_content_selector(self):
        """The real readiness signal — the resume content must be present."""
        page = AsyncMock()
        page.pdf.return_value = b"%PDF-1.4 fake"
        await _render_page_to_pdf(page, "http://f/print/r", ".resume-print", "A4", {"top": "10mm"})
        page.wait_for_selector.assert_awaited()
        selector_arg = page.wait_for_selector.call_args.args[0]
        assert selector_arg == ".resume-print"

    async def test_still_waits_for_fonts(self):
        """Fonts must be loaded before snapshot, else text can render unstyled."""
        page = AsyncMock()
        page.pdf.return_value = b"%PDF-1.4 fake"
        await _render_page_to_pdf(page, "http://f/print/r", ".resume-print", "A4", {"top": "10mm"})
        page.evaluate.assert_any_await("document.fonts.ready")


class TestPlaywrightErrorMapping:
    """#811 + info-disclosure (CLAUDE.md rule 5): the catch-all must NOT leak raw
    Playwright internals (call log, internal navigation URLs) to the client;
    curated, safe messages must be preserved.
    """

    def test_catch_all_is_generic_and_hides_internals(self):
        raw = (
            "Page.goto: Timeout 30000ms exceeded.\n"
            "Call log:\n"
            '  - navigating to "http://localhost:3000/print/resumes/SECRET-RESUME-ID"'
        )
        with pytest.raises(PDFRenderError) as exc_info:
            _raise_playwright_error(PlaywrightError(raw), "http://localhost:3000/print/resumes/SECRET-RESUME-ID")
        msg = str(exc_info.value)
        assert "Call log" not in msg
        assert "SECRET-RESUME-ID" not in msg
        assert "30000ms" not in msg

    def test_connection_refused_message_preserved(self):
        with pytest.raises(PDFRenderError) as exc_info:
            _raise_playwright_error(
                PlaywrightError("net::ERR_CONNECTION_REFUSED at http://localhost:3000"),
                "http://localhost:3000/print/x",
            )
        assert "cannot connect to frontend" in str(exc_info.value).lower()

    def test_missing_executable_message_preserved(self):
        with pytest.raises(PDFRenderError) as exc_info:
            _raise_playwright_error(
                PlaywrightError("Executable doesn't exist at /ms-playwright/chromium"),
                "http://x/",
            )
        assert "playwright install" in str(exc_info.value).lower()


class TestRenderResumePdf:
    """render_resume_pdf — real headless-Chromium render of a self-contained page.

    These require a launchable Chromium and skip cleanly when one is absent.
    Teardown tears down the module-global browser so a leaked process can't
    bleed into other tests.
    """

    @pytest.fixture(autouse=True)
    async def _teardown_renderer(self):
        # Yield first; close the shared browser after every test in this class.
        yield
        await close_pdf_renderer()

    async def test_renders_valid_pdf_bytes(self):
        """THE proof rendering works: real PDF magic header + non-trivial size."""
        pdf = await _render_or_skip(RESUME_PRINT_DATA_URL)
        assert isinstance(pdf, (bytes, bytearray))
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 1000

    async def test_renders_letter_size_with_custom_margins(self):
        """Format + margins flow through into a valid render (LETTER, custom mm)."""
        pdf = await _render_or_skip(
            RESUME_PRINT_DATA_URL,
            page_size="LETTER",
            margins={"top": 20, "right": 15, "bottom": 20, "left": 15},
        )
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 1000


class TestRenderResumePdfErrors:
    """render_resume_pdf error mapping — connection failures become PDFRenderError."""

    @pytest.fixture(autouse=True)
    async def _teardown_renderer(self):
        yield
        await close_pdf_renderer()

    async def test_connection_refused_raises_pdf_render_error(self):
        """A refused target must surface as PDFRenderError, not a raw Playwright
        error — this is the 'cannot connect to frontend' incident path.

        Skips only when Chromium itself can't launch (it still needs a browser
        to *attempt* the connection); a genuine connection failure must raise.
        """
        try:
            with pytest.raises(PDFRenderError) as exc_info:
                await render_resume_pdf(_refused_url())
        except PlaywrightError as exc:
            if "Executable doesn't exist" in str(exc):
                pytest.skip(f"chromium unavailable: {exc}")
            raise
        # The browser launched but couldn't reach the frontend — but if the only
        # failure was a missing executable surfaced as PDFRenderError, treat that
        # as a skip rather than a false-positive pass.
        message = str(exc_info.value).lower()
        if "executable" in message:
            pytest.skip(f"chromium unavailable: {exc_info.value}")
        assert "cannot connect to frontend" in message
