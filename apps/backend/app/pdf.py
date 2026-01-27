"""PDF rendering utilities using headless Chromium."""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Awaitable, NoReturn, Optional

from playwright.async_api import (
    Browser,
    Page,
    Playwright,
    async_playwright,
)
from playwright.async_api import (
    Error as PlaywrightError,
)


class PDFRenderError(Exception):
    """Custom exception for PDF rendering errors with helpful messages."""

    pass


_playwright = None
_browser: Optional[Browser] = None
_init_lock = asyncio.Lock()  # Lock to prevent race condition during initialization
_subprocess_lock = asyncio.Lock()
_subprocess_supported = True


async def init_pdf_renderer() -> None:
    """Initialize the Playwright browser instance.

    Uses asyncio.Lock to prevent race conditions when multiple
    concurrent requests try to initialize the browser simultaneously.
    """
    global _playwright, _browser

    # Fast path: already initialized
    if _browser is not None:
        return

    # Use lock to prevent race condition during initialization
    async with _init_lock:
        # Double-check after acquiring lock
        if _browser is not None:
            return
        _playwright = await async_playwright().start()
        _browser = await _launch_browser(_playwright)


def _resolve_pdf_format(page_size: str) -> str:
    format_map = {
        "A4": "A4",
        "LETTER": "Letter",
    }
    return format_map.get(page_size, "A4")


def _resolve_pdf_margins(margins: Optional[dict]) -> dict:
    if margins:
        return {
            "top": f"{margins.get('top', 10)}mm",
            "right": f"{margins.get('right', 10)}mm",
            "bottom": f"{margins.get('bottom', 10)}mm",
            "left": f"{margins.get('left', 10)}mm",
        }
    return {"top": "10mm", "right": "10mm", "bottom": "10mm", "left": "10mm"}


def _find_chromium_executable() -> Optional[str]:
    if sys.platform != "win32":
        return None
    candidates = [
        Path(os.environ.get("PROGRAMFILES", "C:/Program Files"))
        / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)"))
        / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("PROGRAMFILES", "C:/Program Files"))
        / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)"))
        / "Microsoft/Edge/Application/msedge.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return None


async def _launch_browser(playwright: Playwright) -> Browser:
    try:
        return await playwright.chromium.launch()
    except PlaywrightError as e:
        if "Executable doesn't exist" not in str(e):
            raise
        fallback_executable = _find_chromium_executable()
        if not fallback_executable:
            raise PDFRenderError(
                "Playwright browser executable is missing, and no system Chrome/Edge "
                "installation was found. Install Playwright browsers or install Chrome/Edge."
            ) from e
        return await playwright.chromium.launch(executable_path=fallback_executable)


async def _render_page_to_pdf(
    page: Page,
    url: str,
    selector: str,
    pdf_format: str,
    pdf_margins: dict,
) -> bytes:
    await page.goto(url, wait_until="networkidle")
    await page.wait_for_selector(selector)
    await page.evaluate("document.fonts.ready")
    return await page.pdf(
        format=pdf_format,
        print_background=True,
        margin=pdf_margins,
    )


async def _render_with_browser(
    browser: Browser,
    url: str,
    selector: str,
    pdf_format: str,
    pdf_margins: dict,
) -> bytes:
    page: Page = await browser.new_page()
    try:
        return await _render_page_to_pdf(page, url, selector, pdf_format, pdf_margins)
    finally:
        await page.close()


def _run_in_new_loop(coro: Awaitable[bytes]) -> bytes:
    if sys.platform == "win32":
        from asyncio.windows_events import ProactorEventLoop

        loop = ProactorEventLoop()
    else:
        loop = asyncio.new_event_loop()

    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        try:
            loop.run_until_complete(loop.shutdown_asyncgens())
        finally:
            loop.close()
            asyncio.set_event_loop(None)


def _render_resume_pdf_sync(
    url: str,
    selector: str,
    pdf_format: str,
    pdf_margins: dict,
) -> bytes:
    async def _run() -> bytes:
        async with async_playwright() as playwright:
            browser = await _launch_browser(playwright)
            try:
                return await _render_with_browser(
                    browser, url, selector, pdf_format, pdf_margins
                )
            finally:
                await browser.close()

    return _run_in_new_loop(_run())


async def _render_resume_pdf_in_thread(
    url: str,
    selector: str,
    pdf_format: str,
    pdf_margins: dict,
) -> bytes:
    return await asyncio.to_thread(
        _render_resume_pdf_sync, url, selector, pdf_format, pdf_margins
    )


def _raise_playwright_error(error: PlaywrightError, url: str) -> NoReturn:
    error_msg = str(error)
    if "Executable doesn't exist" in error_msg:
        exe = sys.executable.replace("\\", "/")
        command = f"{exe} -m playwright install chromium"
        raise PDFRenderError(
            "Playwright browser executable is missing or out of date. "
            "Command shown for reference; quote the path if it contains spaces: "
            f"{command}"
        ) from error
    if "net::ERR_CONNECTION_REFUSED" in error_msg:
        raise PDFRenderError(
            f"Cannot connect to frontend for PDF generation. "
            f"Attempted URL: {url}. "
            f"Please ensure: 1) The frontend is running, "
            f"2) The FRONTEND_BASE_URL environment variable in the backend .env file "
            f"matches the URL where your frontend is accessible."
        ) from error
    raise PDFRenderError(f"PDF rendering failed: {error_msg}") from error


def _loop_supports_subprocess() -> bool:
    if sys.platform != "win32":
        return True
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return True
    return loop.__class__.__name__ == "ProactorEventLoop"


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
    global _subprocess_supported

    pdf_format = _resolve_pdf_format(page_size)
    pdf_margins = _resolve_pdf_margins(margins)

    if _browser is not None:
        try:
            return await _render_with_browser(
                _browser, url, selector, pdf_format, pdf_margins
            )
        except PlaywrightError as e:
            _raise_playwright_error(e, url)

    async with _subprocess_lock:
        subprocess_supported = _subprocess_supported
        if subprocess_supported and not _loop_supports_subprocess():
            _subprocess_supported = False
            subprocess_supported = False

    if subprocess_supported:
        try:
            await init_pdf_renderer()
        except NotImplementedError:
            async with _subprocess_lock:
                _subprocess_supported = False
            subprocess_supported = False
        except PlaywrightError as e:
            _raise_playwright_error(e, url)

    if not subprocess_supported:
        try:
            return await _render_resume_pdf_in_thread(
                url, selector, pdf_format, pdf_margins
            )
        except PlaywrightError as e:
            _raise_playwright_error(e, url)

    if _browser is None:
        raise PDFRenderError("PDF renderer failed to initialize.")

    try:
        return await _render_with_browser(
            _browser, url, selector, pdf_format, pdf_margins
        )
    except PlaywrightError as e:
        _raise_playwright_error(e, url)
