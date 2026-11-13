"""Real Chromium checks that the shared browser closes after it sits idle.

After one export, an idle Chromium held about 550 MB (process RSS summed, macOS).
It now closes once no export has used it for a while, and the next export
launches a new one.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path
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
        kept = pdf._browser is browser and browser.is_connected()
    finally:
        # Collect the export on every path, so a failure reports its real error.
        finish.set()
        [outcome] = await asyncio.gather(slow_export, return_exceptions=True)
    assert kept, "The idle countdown retired a browser an export was using"
    assert isinstance(outcome, bytes) and outcome.startswith(b"%PDF"), outcome

    # The finished export restarts the countdown.
    await _wait_past_idle()
    assert pdf._browser is None and not browser.is_connected()


async def test_closing_an_idle_browser_does_not_take_an_export_slot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(pdf, "_PDF_MAX_CONCURRENCY", 1)
    await _export()  # Starts the idle countdown.
    browser = pdf._browser
    assert browser is not None
    closing = asyncio.Event()
    release_close = asyncio.Event()
    original_close = browser.close

    async def slow_close(*args: Any, **kwargs: Any) -> None:
        closing.set()
        await release_close.wait()
        await original_close(*args, **kwargs)

    monkeypatch.setattr(browser, "close", slow_close)
    try:
        await asyncio.wait_for(closing.wait(), IDLE_SECONDS * 10)
        # The only slot is free: nothing is exporting while the idle browser closes.
        assert (await _export()).startswith(b"%PDF")
    finally:
        release_close.set()
        await _settle()
    assert not browser.is_connected()


async def test_a_stuck_idle_close_holds_a_slot_until_it_finishes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A teardown that overruns the cleanup reserve takes a slot, as stale-browser
    # retirement does, so hung closes stay bounded by the export slots.
    await _export()  # Starts the idle countdown.
    browser = pdf._browser
    assert browser is not None
    closing = asyncio.Event()
    release_close = asyncio.Event()
    original_close = browser.close

    async def stuck_close(*args: Any, **kwargs: Any) -> None:
        closing.set()
        await release_close.wait()
        await original_close(*args, **kwargs)

    monkeypatch.setattr(browser, "close", stuck_close)
    try:
        await asyncio.wait_for(closing.wait(), IDLE_SECONDS * 10)
        await asyncio.sleep(pdf._PDF_CLEANUP_RESERVE_SECONDS * 3)
        assert pdf._active_renders == 1, "A stuck idle close held no slot"
    finally:
        release_close.set()
        await _settle()
    assert pdf._active_renders == 0
    assert not browser.is_connected()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("60", "60.0"), ("5", "300.0"), ("86401", "300.0"), ("soon", "300.0")],
)
def test_idle_period_reads_the_environment_within_bounds(
    raw: str, expected: str
) -> None:
    # 10 s to 86,400 s; anything else falls back to the 300 s default.
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from app import pdf; print(pdf._PDF_BROWSER_IDLE_SECONDS)",
        ],
        capture_output=True,
        text=True,
        cwd=Path(__file__).resolve().parents[2],
        env={**os.environ, "PDF_BROWSER_IDLE_SECONDS": raw},
        check=True,
    )
    assert result.stdout.strip() == expected
