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


async def render_resume_pdf(url: str) -> bytes:
    """Render a resume URL to PDF bytes."""
    if _browser is None:
        await init_pdf_renderer()
    assert _browser is not None
    page: Page = await _browser.new_page()
    try:
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_selector(".resume-print")
        await page.evaluate("document.fonts.ready")
        pdf_bytes = await page.pdf(
            format="A4",
            print_background=True,
            margin={"top": "10mm", "right": "10mm", "bottom": "10mm", "left": "10mm"},
        )
        return pdf_bytes
    finally:
        await page.close()
