"""PDF rendering utilities using headless Chromium."""

from __future__ import annotations

from typing import Optional

from playwright.async_api import Browser, Page, async_playwright

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
    url: str, page_size: str = "A4", selector: str = ".resume-print"
) -> bytes:
    """Render a URL to PDF bytes.

    Args:
        url: The URL to render (print route with margins in HTML)
        page_size: Page size format - "A4" or "LETTER"
        selector: CSS selector to wait for before rendering (default: ".resume-print")

    Note:
        Margins are now applied directly in the HTML content for WYSIWYG accuracy.
        The PDF renderer uses zero margins to preserve the HTML layout.
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

    # Zero margins - the HTML content already includes margins via padding
    pdf_margins = {"top": "0mm", "right": "0mm", "bottom": "0mm", "left": "0mm"}

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
    finally:
        await page.close()
