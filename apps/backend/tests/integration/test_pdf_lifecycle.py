"""Regression tests for bounded PDF rendering and browser ownership."""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

import pytest
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

import app.pdf as pdf_module


RESUME_PRINT_DATA_URL = (
    "data:text/html,"
    "<html><body><main class='resume-print'>Synthetic resume</main></body></html>"
)


class ControlledPage:
    """Small Page double with real async timing and cleanup behavior."""

    def __init__(
        self,
        *,
        delay: float = 0.0,
        gate: asyncio.Event | None = None,
        failure: PlaywrightError | None = None,
    ) -> None:
        self.delay = delay
        self.gate = gate
        self.failure = failure
        self.closed = asyncio.Event()

    async def _stage(self) -> None:
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.gate is not None:
            await self.gate.wait()

    async def goto(self, *args: Any, **kwargs: Any) -> None:
        del args, kwargs
        await self._stage()
        if self.failure is not None:
            raise self.failure

    async def wait_for_selector(self, *args: Any, **kwargs: Any) -> None:
        del args, kwargs
        await self._stage()

    async def wait_for_function(self, *args: Any, **kwargs: Any) -> None:
        del args, kwargs
        await self._stage()

    async def pdf(self, *args: Any, **kwargs: Any) -> bytes:
        del args, kwargs
        await self._stage()
        return b"%PDF-1.4 synthetic"

    async def close(self) -> None:
        self.closed.set()


class ControlledBrowser:
    """Browser double that exposes connection and page-admission state."""

    def __init__(self, page_factory: Callable[[], ControlledPage]) -> None:
        self.page_factory = page_factory
        self.connected = True
        self.new_page_calls = 0
        self.entered = asyncio.Event()

    def is_connected(self) -> bool:
        return self.connected

    async def new_page(self) -> ControlledPage:
        self.new_page_calls += 1
        self.entered.set()
        return self.page_factory()

    async def close(self) -> None:
        self.connected = False


@pytest.fixture(autouse=True)
async def reset_renderer_state(
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[None]:
    """Give each lifecycle test clean renderer and admission globals."""
    await pdf_module.close_pdf_renderer()
    monkeypatch.setattr(pdf_module, "_active_renders", 0, raising=False)
    monkeypatch.setattr(pdf_module, "_PDF_MAX_CONCURRENCY", 4, raising=False)
    monkeypatch.setattr(pdf_module, "_PDF_RENDER_TIMEOUT_SECONDS", 2.0, raising=False)
    monkeypatch.setattr(pdf_module, "_PDF_CLEANUP_RESERVE_SECONDS", 0.2, raising=False)
    monkeypatch.setattr(pdf_module, "_subprocess_supported", True)
    yield
    await pdf_module.close_pdf_renderer()


async def _render_or_skip() -> bytes:
    """Render with real Chromium, skipping only when no executable is available."""
    try:
        return await pdf_module.render_resume_pdf(RESUME_PRINT_DATA_URL)
    except pdf_module.PDFRenderError as error:
        if "executable" in str(error).lower():
            pytest.skip(f"chromium unavailable: {error}")
        raise


async def test_disconnected_cached_browser_is_replaced_automatically() -> None:
    """Closing the owned browser must not poison the next real render."""
    first = await _render_or_skip()
    disconnected = pdf_module._browser
    assert disconnected is not None
    await disconnected.close()

    second = await _render_or_skip()
    third = await _render_or_skip()

    assert first.startswith(b"%PDF")
    assert second.startswith(b"%PDF")
    assert third.startswith(b"%PDF")
    assert pdf_module._browser is not disconnected
    assert pdf_module._browser is not None and pdf_module._browser.is_connected()


async def test_simultaneous_recovery_callers_install_one_browser(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Concurrent callers share one replacement without overwriting ownership."""
    await _render_or_skip()
    disconnected = pdf_module._browser
    assert disconnected is not None
    await disconnected.close()
    real_launch = pdf_module._launch_browser
    replacements: list[Any] = []

    async def tracked_launch(playwright: Any) -> Any:
        browser = await real_launch(playwright)
        replacements.append(browser)
        return browser

    monkeypatch.setattr(pdf_module, "_launch_browser", tracked_launch)

    rendered = await asyncio.gather(*(_render_or_skip() for _ in range(4)))

    assert all(pdf.startswith(b"%PDF") for pdf in rendered)
    assert len(replacements) == 1
    assert pdf_module._browser is replacements[0]
    assert replacements[0].is_connected()


async def test_connected_navigation_error_is_not_replayed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A content/navigation failure on a healthy browser remains one attempt."""
    page = ControlledPage(failure=PlaywrightError("synthetic selector failure"))
    browser = ControlledBrowser(lambda: page)
    monkeypatch.setattr(pdf_module, "_browser", browser)

    with pytest.raises(pdf_module.PDFRenderError):
        await pdf_module.render_resume_pdf("data:text/html,broken")

    assert browser.new_page_calls == 1


async def test_playwright_stage_timeout_has_explicit_timeout_outcome(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Playwright's own timer must map to the public lifecycle timeout type."""
    page = ControlledPage(failure=PlaywrightTimeoutError("synthetic timeout"))
    browser = ControlledBrowser(lambda: page)
    monkeypatch.setattr(pdf_module, "_browser", browser)

    with pytest.raises(pdf_module.PDFRenderTimeoutError, match="timed out"):
        await pdf_module.render_resume_pdf("data:text/html,stage-timeout")

    assert browser.new_page_calls == 1
    assert page.closed.is_set()


async def test_zero_queue_admission_rejects_fifth_render(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Capacity saturation fails immediately without starting another page."""
    release = asyncio.Event()
    browser = ControlledBrowser(lambda: ControlledPage(gate=release))
    monkeypatch.setattr(pdf_module, "_browser", browser)
    monkeypatch.setattr(pdf_module, "_PDF_MAX_CONCURRENCY", 4, raising=False)
    active = [
        asyncio.create_task(pdf_module.render_resume_pdf("data:text/html,held"))
        for _ in range(4)
    ]

    while browser.new_page_calls < 4:
        await asyncio.sleep(0)

    with pytest.raises(pdf_module.PDFRenderOverloadedError, match="busy"):
        await asyncio.wait_for(
            pdf_module.render_resume_pdf("data:text/html,overload"), timeout=0.05
        )
    assert browser.new_page_calls == 4

    release.set()
    assert all(result.startswith(b"%PDF") for result in await asyncio.gather(*active))


async def test_one_deadline_bounds_all_slow_render_stages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Individually fast stages cannot exceed the combined operation budget."""
    page = ControlledPage(delay=0.025)
    browser = ControlledBrowser(lambda: page)
    monkeypatch.setattr(pdf_module, "_browser", browser)
    monkeypatch.setattr(pdf_module, "_PDF_RENDER_TIMEOUT_SECONDS", 0.1, raising=False)
    monkeypatch.setattr(pdf_module, "_PDF_CLEANUP_RESERVE_SECONDS", 0.02, raising=False)

    with pytest.raises(pdf_module.PDFRenderTimeoutError, match="timed out"):
        await pdf_module.render_resume_pdf("data:text/html,slow-stages")

    assert page.closed.is_set()


async def test_page_creation_is_inside_total_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A browser that hangs before returning Page still times out."""
    never = asyncio.Event()

    class PageCreationBrowser(ControlledBrowser):
        async def new_page(self) -> ControlledPage:
            self.new_page_calls += 1
            await never.wait()
            return ControlledPage()

    browser = PageCreationBrowser(ControlledPage)
    monkeypatch.setattr(pdf_module, "_browser", browser)
    monkeypatch.setattr(pdf_module, "_PDF_RENDER_TIMEOUT_SECONDS", 0.06, raising=False)
    monkeypatch.setattr(pdf_module, "_PDF_CLEANUP_RESERVE_SECONDS", 0.01, raising=False)

    with pytest.raises(pdf_module.PDFRenderTimeoutError, match="timed out"):
        await pdf_module.render_resume_pdf("data:text/html,page-creation")


async def test_cleanup_timeout_is_part_of_export_outcome(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A page that cannot close retires its browser before capacity is reused."""
    never = asyncio.Event()

    class UncloseablePage(ControlledPage):
        async def close(self) -> None:
            await never.wait()

    browser = ControlledBrowser(UncloseablePage)
    monkeypatch.setattr(pdf_module, "_browser", browser)
    monkeypatch.setattr(pdf_module, "_PDF_RENDER_TIMEOUT_SECONDS", 0.06, raising=False)
    monkeypatch.setattr(pdf_module, "_PDF_CLEANUP_RESERVE_SECONDS", 0.02, raising=False)

    with pytest.raises(pdf_module.PDFRenderTimeoutError, match="timed out"):
        await pdf_module.render_resume_pdf("data:text/html,cleanup-timeout")

    for _ in range(100):
        if pdf_module._active_renders == 0:
            break
        await asyncio.sleep(0.01)
    assert pdf_module._active_renders == 0
    assert browser.connected is False
    assert pdf_module._browser is None


async def test_cancellation_closes_page_and_releases_capacity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cancelling async Playwright work releases both page and admission slot."""
    release = asyncio.Event()
    page = ControlledPage(gate=release)
    browser = ControlledBrowser(lambda: page)
    monkeypatch.setattr(pdf_module, "_browser", browser)
    monkeypatch.setattr(pdf_module, "_PDF_MAX_CONCURRENCY", 1, raising=False)
    task = asyncio.create_task(pdf_module.render_resume_pdf("data:text/html,cancel"))
    await browser.entered.wait()

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert page.closed.is_set()
    assert pdf_module._active_renders == 0


async def test_cancellation_survives_bounded_cleanup_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A stuck teardown retains capacity, then permits a healthy next request."""
    render_gate = asyncio.Event()
    close_gate = asyncio.Event()
    browser_close_entered = asyncio.Event()
    browser_close_gate = asyncio.Event()

    class SlowClosePage(ControlledPage):
        async def close(self) -> None:
            await close_gate.wait()

    class SlowCloseBrowser(ControlledBrowser):
        async def close(self) -> None:
            browser_close_entered.set()
            await browser_close_gate.wait()
            self.connected = False

    page = SlowClosePage(gate=render_gate)
    browser = SlowCloseBrowser(lambda: page)
    monkeypatch.setattr(pdf_module, "_browser", browser)
    monkeypatch.setattr(pdf_module, "_PDF_MAX_CONCURRENCY", 1, raising=False)
    monkeypatch.setattr(pdf_module, "_PDF_CLEANUP_RESERVE_SECONDS", 0.02, raising=False)
    task = asyncio.create_task(pdf_module.render_resume_pdf("data:text/html,cancel-close"))
    await browser.entered.wait()

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    try:
        await asyncio.wait_for(browser_close_entered.wait(), timeout=1)
        assert pdf_module._browser is None
        assert pdf_module._active_renders == 1
        with pytest.raises(pdf_module.PDFRenderOverloadedError, match="busy"):
            await pdf_module.render_resume_pdf("data:text/html,retiring")
    finally:
        close_gate.set()
        browser_close_gate.set()

    for _ in range(100):
        if pdf_module._active_renders == 0:
            break
        await asyncio.sleep(0.01)
    assert pdf_module._active_renders == 0

    healthy_browser = ControlledBrowser(ControlledPage)

    async def install_replacement(
        _work_deadline: float,
        _total_deadline: float,
    ) -> ControlledBrowser:
        pdf_module._browser = healthy_browser
        return healthy_browser

    monkeypatch.setattr(
        pdf_module, "_replace_disconnected_browser", install_replacement
    )
    recovered = await pdf_module.render_resume_pdf("data:text/html,recovered")
    assert recovered.startswith(b"%PDF")


async def test_concurrent_failures_release_all_capacity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Multiple Playwright failures cannot strand admission capacity."""
    failing_browser = ControlledBrowser(
        lambda: ControlledPage(failure=PlaywrightError("synthetic failure"))
    )
    monkeypatch.setattr(pdf_module, "_browser", failing_browser)
    monkeypatch.setattr(pdf_module, "_PDF_MAX_CONCURRENCY", 2, raising=False)

    outcomes = await asyncio.gather(
        pdf_module.render_resume_pdf("data:text/html,fail-one"),
        pdf_module.render_resume_pdf("data:text/html,fail-two"),
        return_exceptions=True,
    )

    assert all(isinstance(outcome, pdf_module.PDFRenderError) for outcome in outcomes)
    assert pdf_module._active_renders == 0

    healthy_browser = ControlledBrowser(ControlledPage)
    monkeypatch.setattr(pdf_module, "_browser", healthy_browser)
    recovered = await pdf_module.render_resume_pdf("data:text/html,recovered")
    assert recovered.startswith(b"%PDF")


async def test_cancelled_windows_worker_keeps_its_admission_slot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """to_thread cancellation cannot admit replacement work before worker exit."""
    worker_started = threading.Event()
    worker_finished = threading.Event()
    allow_worker_finish = threading.Event()

    def controlled_worker(*args: Any, **kwargs: Any) -> bytes:
        del args, kwargs
        worker_started.set()
        allow_worker_finish.wait(timeout=2)
        worker_finished.set()
        return b"%PDF-1.4 threaded"

    monkeypatch.setattr(pdf_module, "_subprocess_supported", False)
    monkeypatch.setattr(pdf_module, "_PDF_MAX_CONCURRENCY", 1, raising=False)
    monkeypatch.setattr(pdf_module, "_render_resume_pdf_sync", controlled_worker)
    task = asyncio.create_task(pdf_module.render_resume_pdf("data:text/html,threaded"))
    assert await asyncio.to_thread(worker_started.wait, 1)

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert pdf_module._active_renders == 1
    with pytest.raises(pdf_module.PDFRenderOverloadedError, match="busy"):
        await pdf_module.render_resume_pdf("data:text/html,overload")

    allow_worker_finish.set()
    assert await asyncio.to_thread(worker_finished.wait, 1)
    for _ in range(100):
        if pdf_module._active_renders == 0:
            break
        await asyncio.sleep(0.01)
    assert pdf_module._active_renders == 0


async def test_detached_worker_failure_is_logged_server_side(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An unexpected detached worker failure must remain observable."""

    async def fail() -> bytes:
        raise RuntimeError("synthetic detached worker failure")

    pdf_module._active_renders = 1
    worker = asyncio.create_task(fail())
    with caplog.at_level(logging.ERROR, logger="app.pdf"):
        await pdf_module._release_slot_after_worker(worker)

    assert "Detached PDF fallback worker failed" in caplog.text
    assert "synthetic detached worker failure" in caplog.text
    assert pdf_module._active_renders == 0


async def test_non_timeout_page_close_failure_retires_browser(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    release = asyncio.Event()
    closing = asyncio.Event()
    stopped = asyncio.Event()

    class BrokenPage(ControlledPage):
        async def close(self) -> None:
            raise PlaywrightError("synthetic page close failure")

    class SlowBrowser(ControlledBrowser):
        async def close(self) -> None:
            closing.set()
            await release.wait()
            self.connected = False
            stopped.set()

    browser = SlowBrowser(BrokenPage)
    monkeypatch.setattr(pdf_module, "_browser", browser)
    monkeypatch.setattr(pdf_module, "_PDF_MAX_CONCURRENCY", 1)
    try:
        with caplog.at_level(logging.ERROR, logger="app.pdf"):
            result = await pdf_module.render_resume_pdf("data:text/html,close-error")
        assert result == b"%PDF-1.4 synthetic"
        assert "synthetic page close failure" in caplog.text
        assert pdf_module._browser is None
        assert pdf_module._active_renders == 1
        await asyncio.wait_for(closing.wait(), timeout=1)
        with pytest.raises(pdf_module.PDFRenderOverloadedError):
            await pdf_module.render_resume_pdf("data:text/html,no-capacity")
    finally:
        release.set()
        for _ in range(100):
            if pdf_module._active_renders == 0:
                break
            await asyncio.sleep(0.01)
    assert stopped.is_set() and pdf_module._active_renders == 0


@pytest.mark.parametrize("render_failed", [False, True])
async def test_cancellation_during_page_close_keeps_browser_cleanup_owned(
    monkeypatch: pytest.MonkeyPatch,
    render_failed: bool,
) -> None:
    """Cancel at page.close, after render settlement, without abandoning Chromium."""
    page_closing = asyncio.Event()
    page_close_cancelled = asyncio.Event()
    browser_closing = asyncio.Event()
    release_browser = asyncio.Event()
    driver_stopping = asyncio.Event()
    release_driver = asyncio.Event()
    driver_stopped = asyncio.Event()

    class InterruptedPage(ControlledPage):
        async def close(self) -> None:
            page_closing.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                page_close_cancelled.set()
                raise

    class SlowBrowser(ControlledBrowser):
        async def close(self) -> None:
            browser_closing.set()
            await release_browser.wait()
            self.connected = False

    class SlowPlaywright:
        async def stop(self) -> None:
            driver_stopping.set()
            await release_driver.wait()
            driver_stopped.set()

    page = InterruptedPage(
        failure=PlaywrightError("synthetic render failure") if render_failed else None
    )
    browser = SlowBrowser(lambda: page)
    monkeypatch.setattr(pdf_module, "_browser", browser)
    monkeypatch.setattr(pdf_module, "_playwright", SlowPlaywright())
    monkeypatch.setattr(pdf_module, "_PDF_MAX_CONCURRENCY", 1)
    task = asyncio.create_task(pdf_module.render_resume_pdf("data:text/html,cancel-close"))
    try:
        await asyncio.wait_for(page_closing.wait(), timeout=1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, timeout=1)

        assert page_close_cancelled.is_set()
        assert pdf_module._browser is None
        assert pdf_module._playwright is None
        assert pdf_module._active_renders == 1
        await asyncio.wait_for(browser_closing.wait(), timeout=1)
        with pytest.raises(pdf_module.PDFRenderOverloadedError):
            await pdf_module.render_resume_pdf("data:text/html,browser-still-closing")

        release_browser.set()
        await asyncio.wait_for(driver_stopping.wait(), timeout=1)
        assert not browser.is_connected()
        assert not driver_stopped.is_set()
        assert pdf_module._active_renders == 1
        with pytest.raises(pdf_module.PDFRenderOverloadedError):
            await pdf_module.render_resume_pdf("data:text/html,driver-still-stopping")
    finally:
        release_browser.set()
        release_driver.set()
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        await asyncio.wait_for(
            asyncio.gather(*pdf_module._background_owners), timeout=1
        )
    assert driver_stopped.is_set() and pdf_module._active_renders == 0


async def test_cancelled_stale_browser_cleanup_keeps_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    release = asyncio.Event()
    entered = asyncio.Event()
    stopped = asyncio.Event()

    class StaleBrowser(ControlledBrowser):
        async def close(self) -> None:
            entered.set()
            await release.wait()
            stopped.set()

    browser = StaleBrowser(ControlledPage)
    browser.connected = False
    monkeypatch.setattr(pdf_module, "_browser", browser)
    monkeypatch.setattr(pdf_module, "_PDF_MAX_CONCURRENCY", 1)
    task = asyncio.create_task(pdf_module.render_resume_pdf("data:text/html,stale"))
    await asyncio.wait_for(entered.wait(), 1)
    task.cancel()
    try:
        with pytest.raises(asyncio.CancelledError):
            await task
        assert pdf_module._active_renders == 1
        assert not stopped.is_set()
    finally:
        release.set()
        for _ in range(100):
            if stopped.is_set() and pdf_module._active_renders == 0:
                break
            await asyncio.sleep(0.01)
    assert stopped.is_set() and pdf_module._active_renders == 0


async def test_thread_fallback_inherits_remaining_deadline(monkeypatch: pytest.MonkeyPatch) -> None:
    import time
    deadlines: list[float] = []
    started = time.monotonic()
    monkeypatch.setattr(pdf_module, "_PDF_RENDER_TIMEOUT_SECONDS", 0.3)

    async def unsupported(*args: Any) -> bytes:
        await asyncio.sleep(0.1)
        raise NotImplementedError

    def worker(url: str, selector: str, pdf_format: str, margins: dict[str, Any], deadline: float) -> bytes:
        deadlines.append(deadline)
        return b"%PDF"

    monkeypatch.setattr(pdf_module, "_render_on_shared_browser", unsupported)
    monkeypatch.setattr(pdf_module, "_render_resume_pdf_sync", worker)
    assert await pdf_module.render_resume_pdf("data:text/html,fallback") == b"%PDF"
    assert deadlines[0] - started < 0.35
