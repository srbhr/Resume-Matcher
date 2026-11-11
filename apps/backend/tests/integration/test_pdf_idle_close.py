"""Real Chromium checks that the shared browser closes after it sits idle.

After one export, an idle Chromium held about 550 MB (process RSS summed, macOS).
It now closes once no export has used it for a while, and the next export
launches a new one.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest
from playwright.async_api import Page

from app import pdf
from tests.integration.test_pdf_lifecycle import RESUME_PRINT_DATA_URL

IDLE_SECONDS = 0.3


@pytest.fixture(autouse=True)
async def clean_renderer(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[None]:
    await pdf.close_pdf_renderer()
    monkeypatch.setattr(pdf, "_PDF_RENDER_TIMEOUT_SECONDS", 10.0)
    monkeypatch.setattr(pdf, "_PDF_CLEANUP_RESERVE_SECONDS", 0.3)
    monkeypatch.setattr(pdf, "_PDF_BROWSER_IDLE_SECONDS", IDLE_SECONDS, raising=False)
    yield
    await pdf.close_pdf_renderer()
    await _settle()
    assert not pdf._browser_users
    assert pdf._active_renders == 0


async def _settle() -> None:
    if pdf._background_owners:
        await asyncio.wait_for(asyncio.gather(*pdf._background_owners), 3)


async def _export() -> bytes:
    try:
        return await pdf.render_resume_pdf(RESUME_PRINT_DATA_URL)
    except pdf.PDFRenderError as error:
        if "executable" in str(error).lower():
            pytest.skip(str(error))
        raise


async def _wait_past_idle() -> None:
    await asyncio.sleep(IDLE_SECONDS * 3)
    await _settle()


async def test_idle_browser_closes_after_the_idle_period() -> None:
    assert (await _export()).startswith(b"%PDF")
    browser = pdf._browser
    assert browser is not None and browser.is_connected()

    await _wait_past_idle()

    assert pdf._browser is None and pdf._playwright is None
    assert not browser.is_connected()
    assert pdf._active_renders == 0


async def test_next_export_after_idle_close_launches_a_new_browser() -> None:
    await _export()
    first = pdf._browser
    await _wait_past_idle()

    assert (await _export()).startswith(b"%PDF")
    assert pdf._browser is not None and pdf._browser is not first


async def test_browser_stays_open_while_an_export_outlasts_the_idle_period(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _export()  # Starts the idle countdown.
    browser = pdf._browser
    started = asyncio.Event()
    finish = asyncio.Event()
    original_render = pdf._render_page_to_pdf

    async def slow_render(page: Page, *args: Any) -> bytes:
        started.set()
        await finish.wait()
        return await original_render(page, *args)

    monkeypatch.setattr(pdf, "_render_page_to_pdf", slow_render)
    slow_export = asyncio.create_task(_export())
    try:
        await asyncio.wait_for(started.wait(), 5)
        await asyncio.sleep(IDLE_SECONDS * 3)
        assert pdf._browser is browser and browser.is_connected(), (
            "The idle countdown retired a browser an export was using"
        )
    finally:
        finish.set()
    assert (await slow_export).startswith(b"%PDF")

    # The finished export restarts the countdown.
    await _wait_past_idle()
    assert pdf._browser is None and not browser.is_connected()
