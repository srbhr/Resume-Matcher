"""PDF rendering utilities using headless Chromium."""

from __future__ import annotations

from typing import Optional

from playwright.async_api import Browser, Error as PlaywrightError, Page, async_playwright


class PDFRenderError(Exception):
    """Custom exception for PDF rendering errors with helpful messages."""

    pass

_playwright = None
_browser: Optional[Browser] = None


async def init_pdf_renderer() -> None:
    """Initialize the Playwright browser instance."""
    global _playwright, _browser
    if _browser is not None:
        return
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.launch()


async def close_pdf_renderer() -> None:
    """Close the Playwright browser instance."""
    global _playwright, _browser
    if _browser is not None:
        await _browser.close()
        _browser = None
    if _playwright is not None:
        await _playwright.stop()
        _playwright = None


async def render_resume_pdf(
    url: str,
    page_size: str = "A4",
    selector: str = ".resume-print",
    margins: Optional[dict] = None,
) -> bytes:
    """Render a URL to PDF bytes.

    Args:
        url: The URL to render (print route)
        page_size: Page size format - "A4" or "LETTER"
        selector: CSS selector to wait for before rendering (default: ".resume-print")
        margins: Page margins dict with top/right/bottom/left in mm (applied to every page)

    Note:
        Margins are applied via Playwright's PDF margins, ensuring they appear
        on every page (not just the first page like HTML padding would).
    """
    if _browser is None:
        await init_pdf_renderer()
    assert _browser is not None

    # Map page size to Playwright format
    format_map = {
        "A4": "A4",
        "LETTER": "Letter",
    }
    pdf_format = format_map.get(page_size, "A4")

    # Use provided margins or defaults (applied to every page)
    if margins:
        pdf_margins = {
            "top": f"{margins.get('top', 10)}mm",
            "right": f"{margins.get('right', 10)}mm",
            "bottom": f"{margins.get('bottom', 10)}mm",
            "left": f"{margins.get('left', 10)}mm",
        }
    else:
        pdf_margins = {"top": "10mm", "right": "10mm", "bottom": "10mm", "left": "10mm"}

    page: Page = await _browser.new_page()
    try:
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_selector(selector)
        await page.evaluate("document.fonts.ready")
        pdf_bytes = await page.pdf(
            format=pdf_format,
            print_background=True,
            margin=pdf_margins,
        )
        return pdf_bytes
    except PlaywrightError as e:
        error_msg = str(e)
        if "net::ERR_CONNECTION_REFUSED" in error_msg:
            # Extract the URL from the error message if possible
            raise PDFRenderError(
                f"Cannot connect to frontend for PDF generation. "
                f"Attempted URL: {url}. "
                f"Please ensure: 1) The frontend is running, "
                f"2) The FRONTEND_BASE_URL environment variable in the backend .env file "
                f"matches the URL where your frontend is accessible."
            ) from e
        raise PDFRenderError(f"PDF rendering failed: {error_msg}") from e
    finally:
        await page.close()
