"""Shutdown releases every resource even when a step fails or is cancelled."""

import asyncio
from collections.abc import Callable, Coroutine
from typing import Any

import pytest

from app import main
from app.services import queue_worker


@pytest.fixture
def steps(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Record which later shutdown steps ran."""
    calls: list[str] = []

    def recorder(name: str) -> Callable[[], Coroutine[Any, Any, None]]:
        async def step() -> None:
            calls.append(name)

        return step

    monkeypatch.setattr(main, "drain_processing_cleanup_tasks", recorder("drain"))
    monkeypatch.setattr(main, "close_pdf_renderer", recorder("pdf"))
    monkeypatch.setattr(main.db, "close", recorder("db"))
    return calls


async def test_cancelled_queue_stop_still_closes_everything_then_propagates(
    monkeypatch: pytest.MonkeyPatch, steps: list[str]
) -> None:
    async def cancelled_stop() -> None:
        raise asyncio.CancelledError

    monkeypatch.setattr(queue_worker.queue_manager, "stop", cancelled_stop)

    with pytest.raises(asyncio.CancelledError):
        await main._shutdown()
    assert steps == ["drain", "pdf", "db"]


async def test_failed_queue_stop_is_logged_and_shutdown_continues(
    monkeypatch: pytest.MonkeyPatch,
    steps: list[str],
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def failing_stop() -> None:
        raise RuntimeError("synthetic stop failure")

    monkeypatch.setattr(queue_worker.queue_manager, "stop", failing_stop)

    await main._shutdown()
    assert steps == ["drain", "pdf", "db"]
    assert "Error stopping the tailoring queue" in caplog.text
