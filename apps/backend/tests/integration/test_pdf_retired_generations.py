"""Real Chromium controls for retirement across concurrent exports."""

from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import pytest
from playwright.async_api import Browser, Error as PlaywrightError, Page

from app import pdf
from tests.integration.test_pdf_lifecycle import RESUME_PRINT_DATA_URL


@pytest.fixture(autouse=True)
async def clean_renderer(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[None]:
    await pdf.close_pdf_renderer()
    monkeypatch.setattr(pdf, "_PDF_RENDER_TIMEOUT_SECONDS", 10.0)
    monkeypatch.setattr(pdf, "_PDF_CLEANUP_RESERVE_SECONDS", 0.3)
    yield
    await pdf.close_pdf_renderer()
    if pdf._background_owners:
        await asyncio.wait_for(asyncio.gather(*pdf._background_owners), 3)
    assert not pdf._browser_users
    assert pdf._active_renders == 0


async def _warm_browser() -> Browser:
    try:
        await pdf.init_pdf_renderer()
    except pdf.PDFRenderError as error:
        if "executable" in str(error).lower():
            pytest.skip(str(error))
        raise
    assert pdf._browser is not None
    return pdf._browser


@pytest.mark.parametrize("failed_exports", [1, 2])
async def test_page_cleanup_failure_does_not_replay_a_healthy_export(
    monkeypatch: pytest.MonkeyPatch,
    failed_exports: int,
) -> None:
    browser = await _warm_browser()
    healthy_started = asyncio.Event()
    continue_healthy = asyncio.Event()
    rendered_pages: list[Page] = []
    original_render = pdf._render_page_to_pdf
    original_close = Page.close
    original_browser_close = browser.close
    close_calls = 0
    closed_before_healthy_finished = False
    unhealthy_url = RESUME_PRINT_DATA_URL.replace("Synthetic", "Unhealthy")

    async def render(page: Page, url: str, *args: Any) -> bytes:
        if url == RESUME_PRINT_DATA_URL:
            rendered_pages.append(page)
            healthy_started.set()
            await continue_healthy.wait()
        return await original_render(page, url, *args)

    async def close(page: Page, *args: Any, **kwargs: Any) -> None:
        if "Unhealthy" in page.url:
            raise PlaywrightError("synthetic page disposal failure")
        await original_close(page, *args, **kwargs)

    async def close_browser() -> None:
        nonlocal close_calls, closed_before_healthy_finished
        close_calls += 1
        closed_before_healthy_finished = not healthy.done()
        await original_browser_close()

    monkeypatch.setattr(browser, "close", close_browser)
    monkeypatch.setattr(pdf, "_render_page_to_pdf", render)
    monkeypatch.setattr(Page, "close", close)
    healthy = asyncio.create_task(pdf.render_resume_pdf(RESUME_PRINT_DATA_URL))
    try:
        await asyncio.wait_for(healthy_started.wait(), 2)
        drain_entered = asyncio.Event()
        original_wait = pdf._browser_users[browser].drained.wait

        async def wait_for_users() -> bool:
            drain_entered.set()
            return await original_wait()

        monkeypatch.setattr(pdf._browser_users[browser].drained, "wait", wait_for_users)
        unhealthy_results = await asyncio.gather(*(
            pdf.render_resume_pdf(unhealthy_url) for _ in range(failed_exports)
        ))
        assert all(result.startswith(b"%PDF") for result in unhealthy_results)
        assert pdf._browser is None
        await asyncio.wait_for(drain_entered.wait(), 2)
        assert close_calls == 0, "Retirement closed a generation still in use"
        assert pdf._active_renders == 2  # Healthy request plus failed-page cleanup.
        continue_healthy.set()
        healthy_result = await healthy
        assert healthy_result.startswith(b"%PDF")
        assert len(rendered_pages) == 1, "A different export's cleanup replayed this page"
    finally:
        continue_healthy.set()
        await asyncio.gather(healthy, return_exceptions=True)
        if pdf._background_owners:
            await asyncio.wait_for(asyncio.gather(*pdf._background_owners), 3)
    assert not browser.is_connected()
    assert close_calls == 1 and not closed_before_healthy_finished
    assert pdf._active_renders == 0


@pytest.mark.skipif(sys.platform == "win32", reason="Read-only PID probe uses POSIX signal zero")
async def test_real_driver_stop_settles_retirement_after_browser_close_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    browser = await _warm_browser()
    driver = pdf._playwright
    assert driver is not None
    session = await browser.new_browser_cdp_session()
    processes = await session.send("SystemInfo.getProcessInfo")
    browser_pid = next(int(p["id"]) for p in processes["processInfo"] if p["type"] == "browser")
    await session.detach()
    original_close = Browser.close
    stopped = asyncio.Event()
    original_stop = driver.stop

    async def close(target: Browser, *args: Any, **kwargs: Any) -> None:
        if target is browser:
            raise PlaywrightError("synthetic close transport error")
        await original_close(target, *args, **kwargs)

    async def stop() -> None:
        await original_stop()
        stopped.set()

    monkeypatch.setattr(Browser, "close", close)
    monkeypatch.setattr(driver, "stop", stop)
    owner = pdf._retire_shared_browser(browser)
    assert owner is not None
    try:
        await asyncio.wait_for(stopped.wait(), 3)
        # Signal zero only observes this test's own launched Chromium PID.
        with pytest.raises(ProcessLookupError):
            os.kill(browser_pid, 0)
        await asyncio.wait_for(asyncio.shield(owner), 3)
        assert owner.done(), "Stopped driver and reaped Chromium still retain capacity"
        assert pdf._active_renders == 0
    finally:
        if not owner.done():
            owner.cancel()
        await asyncio.gather(owner, return_exceptions=True)


async def test_normal_browser_close_and_driver_stop_disconnects() -> None:
    browser = await _warm_browser()
    driver = pdf._playwright
    assert driver is not None
    await browser.close()
    await driver.stop()
    assert not browser.is_connected()


@pytest.mark.parametrize("release_during_shutdown", [False, True])
async def test_pending_driver_stop_retains_capacity_and_shutdown_waits(
    monkeypatch: pytest.MonkeyPatch,
    release_during_shutdown: bool,
) -> None:
    browser = await _warm_browser()
    driver = pdf._playwright
    assert driver is not None
    original_stop = driver.stop
    stopping = asyncio.Event()
    release_stop = asyncio.Event()
    shutdown_wait_entered = asyncio.Event()
    allow_shutdown_wait = asyncio.Event()
    original_wait = asyncio.wait

    async def wait_for_owners(
        owners: set[asyncio.Task[None]], *, timeout: float
    ) -> tuple[set[asyncio.Task[None]], set[asyncio.Task[None]]]:
        assert owner in owners
        assert timeout == pdf._PDF_CLEANUP_RESERVE_SECONDS
        shutdown_wait_entered.set()
        await allow_shutdown_wait.wait()
        return await original_wait(owners, timeout=timeout)

    async def stop() -> None:
        stopping.set()
        await release_stop.wait()
        await original_stop()

    monkeypatch.setattr(driver, "stop", stop)
    monkeypatch.setattr(pdf, "_PDF_MAX_CONCURRENCY", 1)
    owner = pdf._retire_shared_browser(browser)
    assert owner is not None
    shutdown: asyncio.Task[None] | None = None
    try:
        await asyncio.wait_for(stopping.wait(), 2)
        assert pdf._active_renders == 1, "Pending driver teardown released capacity"
        with pytest.raises(pdf.PDFRenderOverloadedError):
            await pdf.render_resume_pdf(RESUME_PRINT_DATA_URL)
        monkeypatch.setattr(asyncio, "wait", wait_for_owners)
        shutdown = asyncio.create_task(pdf.close_pdf_renderer())
        await asyncio.wait_for(shutdown_wait_entered.wait(), 2)
        assert not shutdown.done(), "Shutdown ignored owned retirement"
        allow_shutdown_wait.set()
        if not release_during_shutdown:
            await asyncio.wait_for(shutdown, 2)
            assert owner in pdf._background_owners and not owner.done()
            assert pdf._active_renders == 1
        release_stop.set()
        await asyncio.wait_for(shutdown, 2)
        await asyncio.wait_for(asyncio.shield(owner), 2)
        assert pdf._active_renders == 0
    finally:
        allow_shutdown_wait.set()
        release_stop.set()
        await original_stop()
        if not owner.done():
            owner.cancel()
        await asyncio.gather(owner, return_exceptions=True)
        if shutdown is not None:
            await asyncio.gather(shutdown, return_exceptions=True)


async def test_failed_one_shot_driver_stop_cannot_acknowledge_a_live_browser(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Drive the real public stop wrapper through an internal transport failure."""
    browser = await _warm_browser()
    driver = pdf._playwright
    assert driver is not None
    context = driver.stop.__self__
    connection = context._connection
    original_stop_async = connection.stop_async
    stop_failed = asyncio.Event()

    async def close() -> None:
        raise PlaywrightError("synthetic browser close failure")

    async def stop_connection() -> None:
        stop_failed.set()
        raise PlaywrightError("synthetic connection shutdown failure")

    monkeypatch.setattr(browser, "close", close)
    monkeypatch.setattr(connection, "stop_async", stop_connection)
    owner = pdf._retire_shared_browser(browser)
    assert owner is not None
    try:
        await asyncio.wait_for(stop_failed.wait(), 2)
        with pytest.raises(pdf.PDFRenderError, match="restart"):
            await asyncio.wait_for(asyncio.shield(owner), 2)
        assert browser.is_connected()
        # The first public stop call marks the context exited before failing;
        # calling it again is a no-op, not proof that the live driver stopped.
        assert pdf._active_renders == 1
        assert pdf._quarantined_browsers.get(browser) is driver
        assert owner.done() and not owner.cancelled()
        await pdf.close_pdf_renderer()
        assert "quarantined browser generations" in caplog.text
        assert pdf._active_renders == 1
    finally:
        # Direct invocation is only a test cleanup for the owned real driver,
        # deliberately bypassing its now-disabled public stop wrapper.
        # A cleanup error must still restore test state, without asserting
        # that the real driver stopped or releasing production quarantine.
        await _restore_quarantined_test_driver(browser, owner, original_stop_async)


async def _restore_quarantined_test_driver(
    browser: Browser,
    owner: asyncio.Task[None],
    stop: Callable[[], Awaitable[None]],
) -> None:
    """Restore test state without treating this as production teardown proof."""
    try:
        await stop()
    finally:
        try:
            if not owner.done():
                owner.cancel()
            await asyncio.gather(owner, return_exceptions=True)
        finally:
            if browser in pdf._quarantined_browsers:
                pdf._quarantined_browsers.pop(browser)
                pdf._release_render_slot()


async def test_quarantine_test_cleanup_restores_state_when_stop_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    browser = await _warm_browser()
    driver = pdf._playwright
    assert driver is not None
    original_stop = driver.stop

    async def fail_close() -> None:
        raise PlaywrightError("synthetic close failure")

    async def fail_stop() -> None:
        raise PlaywrightError("synthetic stop failure")

    async def stop_then_fail() -> None:
        await original_stop()
        raise RuntimeError("test cleanup sentinel")

    monkeypatch.setattr(browser, "close", fail_close)
    monkeypatch.setattr(driver, "stop", fail_stop)
    owner = pdf._retire_shared_browser(browser)
    assert owner is not None
    try:
        with pytest.raises(pdf.PDFRenderError, match="restart"):
            await asyncio.wait_for(asyncio.shield(owner), 2)
        with pytest.raises(RuntimeError, match="test cleanup sentinel"):
            await _restore_quarantined_test_driver(browser, owner, stop_then_fail)
        assert browser not in pdf._quarantined_browsers
        assert owner not in pdf._background_owners
        assert pdf._active_renders == 0
    finally:
        await original_stop()
        pdf._quarantined_browsers.pop(browser, None)
        # This regression owns all state and has stopped its real driver.
        pdf._active_renders = 0


@pytest.mark.parametrize("cancel_before_start", [False, True])
@pytest.mark.parametrize("retain_slot", [False, True])
async def test_cancelled_retirement_keeps_live_generation_owned(
    monkeypatch: pytest.MonkeyPatch,
    cancel_before_start: bool,
    retain_slot: bool,
) -> None:
    browser = await _warm_browser()
    driver = pdf._playwright
    assert driver is not None
    healthy_started = asyncio.Event()
    release_healthy = asyncio.Event()
    drain_entered = asyncio.Event()
    original_render = pdf._render_page_to_pdf
    rendered_pages: list[Page] = []

    async def render(page: Page, url: str, *args: Any) -> bytes:
        rendered_pages.append(page)
        healthy_started.set()
        await release_healthy.wait()
        return await original_render(page, url, *args)

    monkeypatch.setattr(pdf, "_render_page_to_pdf", render)
    healthy = asyncio.create_task(pdf.render_resume_pdf(RESUME_PRINT_DATA_URL))
    owner: asyncio.Task[None] | None = None
    try:
        await asyncio.wait_for(healthy_started.wait(), 2)
        users = pdf._browser_users[browser]
        original_wait = users.drained.wait

        async def wait_for_users() -> bool:
            drain_entered.set()
            return await original_wait()

        monkeypatch.setattr(users.drained, "wait", wait_for_users)
        owner = pdf._retire_shared_browser(browser, retain_slot=retain_slot)
        assert owner is not None
        if not cancel_before_start:
            await asyncio.wait_for(drain_entered.wait(), 2)
        owner.cancel()
        with pytest.raises(asyncio.CancelledError):
            await owner
        assert browser.is_connected()
        assert pdf._quarantined_browsers.get(browser) is driver
        assert owner not in pdf._background_owners
        assert pdf._active_renders == 2  # Healthy request plus unclosed generation.
        release_healthy.set()
        result = await asyncio.wait_for(healthy, 2)
        assert result.startswith(b"%PDF") and len(rendered_pages) == 1
        assert not pdf._browser_users
        assert pdf._active_renders == 1
    finally:
        release_healthy.set()
        await asyncio.gather(healthy, return_exceptions=True)
        if owner is not None:
            if not owner.done():
                owner.cancel()
            await asyncio.gather(owner, return_exceptions=True)
        await driver.stop()
        pdf._quarantined_browsers.pop(browser, None)
        # Only test-owned resources are present; stop completed above.
        pdf._active_renders = 0
