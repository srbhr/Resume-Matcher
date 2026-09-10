"""Bound caller cleanup without abandoning SQLite attempt ownership."""
import asyncio
from typing import Any

import pytest

from app.routers import resumes


async def test_cpython_caught_cancellation_does_not_repeat_without_new_cancel() -> None:
    started, caught, release = asyncio.Event(), asyncio.Event(), asyncio.Event()

    async def worker() -> int:
        started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            caught.set()
        await release.wait()
        task = asyncio.current_task()
        assert task is not None
        return task.cancelling()

    task = asyncio.create_task(worker())
    await started.wait()
    task.cancel()
    await caught.wait()
    release.set()
    # The cancellation count remains nonzero without injecting another exception.
    assert await asyncio.wait_for(task, 1) == 1


@pytest.mark.parametrize("newer_attempt", [False, True])
async def test_stalled_finish_returns_bounded_and_keeps_owned_background_cleanup(
    isolated_db: Any, monkeypatch: pytest.MonkeyPatch, newer_attempt: bool,
) -> None:
    monkeypatch.setattr(resumes, "_PROCESSING_CLEANUP_TIMEOUT_SECONDS", 0.02, raising=False)
    record = await isolated_db.create_resume_atomic_master(content="Synthetic resume", processing_status="processing")
    resume_id = record["resume_id"]
    token = await isolated_db.claim_resume_processing(resume_id)
    assert token is not None
    entered, release = asyncio.Event(), asyncio.Event()
    finish = isolated_db.finish_resume_processing

    async def stalled(*args: Any, **kwargs: Any) -> Any:
        entered.set()
        await release.wait()
        return await finish(*args, **kwargs)

    monkeypatch.setattr(isolated_db, "finish_resume_processing", stalled)
    caller = asyncio.create_task(resumes._finish_cancelled_processing(resume_id, token))
    await entered.wait()
    for _ in range(3):
        caller.cancel()
        await asyncio.sleep(0)
    completed, _ = await asyncio.wait({caller}, timeout=0.15)
    background: list[asyncio.Task[Any]] = []
    try:
        assert caller in completed, "cleanup pinned the caller past its secondary deadline"
        background = list(resumes._PROCESSING_CLEANUP_TASKS)
        assert background and any(not task.done() for task in background)
        if newer_attempt:
            assert await isolated_db.claim_resume_processing(resume_id) != token
    finally:
        release.set()
        await asyncio.wait_for(caller, 1)
        if background:
            await asyncio.wait_for(asyncio.gather(*background), 1)
    saved = await isolated_db.get_resume(resume_id)
    assert saved is not None
    assert saved["processing_status"] == ("processing" if newer_attempt else "failed")
    assert not resumes._PROCESSING_CLEANUP_TASKS


@pytest.mark.parametrize("newer_attempt", [False, True])
async def test_late_claim_is_retired_after_cancelled_caller_returns(
    isolated_db: Any, monkeypatch: pytest.MonkeyPatch, newer_attempt: bool,
) -> None:
    monkeypatch.setattr(resumes, "_PROCESSING_CLEANUP_TIMEOUT_SECONDS", 0.02, raising=False)
    record = await isolated_db.create_resume_atomic_master(content="Synthetic resume", processing_status="processing")
    resume_id = record["resume_id"]
    entered, release = asyncio.Event(), asyncio.Event()
    claim = isolated_db.claim_resume_processing

    async def stalled(*args: Any, **kwargs: Any) -> str | None:
        token = await claim(*args, **kwargs)
        entered.set()
        await release.wait()
        return token

    monkeypatch.setattr(isolated_db, "claim_resume_processing", stalled)
    caller = asyncio.create_task(resumes._claim_processing(resume_id))
    await entered.wait()
    caller.cancel()
    completed, _ = await asyncio.wait({caller}, timeout=0.15)
    background: list[asyncio.Task[Any]] = []
    try:
        assert caller in completed, "a late claim pinned the cancelled caller"
        background = list(resumes._PROCESSING_CLEANUP_TASKS)
        assert background and any(not task.done() for task in background)
        if newer_attempt:
            await claim(resume_id)
    finally:
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(caller, 1)
        if background:
            await asyncio.wait_for(asyncio.gather(*background), 1)
    saved = await isolated_db.get_resume(resume_id)
    assert saved is not None
    assert saved["processing_status"] == ("processing" if newer_attempt else "failed")
    assert not resumes._PROCESSING_CLEANUP_TASKS
