"""The tailoring queue worker against the real per-test database, with a stub pipeline."""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from app.database import Database
from app.services.queue_worker import QueueManager

Pipeline = Callable[..., Awaitable[tuple[Any, ...]]]


@pytest.fixture
def calls() -> list[dict[str, Any]]:
    return []


@pytest.fixture
def stub_pipeline(
    monkeypatch: pytest.MonkeyPatch, calls: list[dict[str, Any]]
) -> Callable[[Pipeline], None]:
    """Replace the LLM pipeline; the default records the call and returns a resume."""

    async def succeed(*, resume_id: str, job_id: str, prompt_id: str | None) -> tuple:
        calls.append({"resume_id": resume_id, "job_id": job_id, "prompt_id": prompt_id})
        return (
            {"resume_id": f"tailored-{len(calls)}", "title": "Dev @ Co"},
            {},
            [],
            "",
            {},
        )

    def install(pipeline: Pipeline) -> None:
        monkeypatch.setattr("app.routers.resumes.execute_tailoring_pipeline", pipeline)

    install(succeed)
    return install


@pytest.fixture
def cooldowns(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    recorded: list[float] = []

    async def record(self: QueueManager, seconds: float) -> None:
        del self
        recorded.append(seconds)

    monkeypatch.setattr(QueueManager, "_cooldown", record)
    return recorded


async def test_drain_tailors_pending_items_oldest_first(
    isolated_db: Database,
    stub_pipeline: Callable[[Pipeline], None],
    calls: list[dict[str, Any]],
    cooldowns: list[float],
) -> None:
    await isolated_db.create_queue_item(
        "q1", "r1", "First JD", rate_limit_seconds=3.0, prompt_id="nudge"
    )
    await isolated_db.create_queue_item("q2", "r1", "Second JD", rate_limit_seconds=0)

    await QueueManager().drain()

    first = await isolated_db.get_queue_item("q1")
    second = await isolated_db.get_queue_item("q2")
    assert first is not None and second is not None
    assert [call["job_id"] for call in calls] == [first["job_id"], second["job_id"]]
    assert calls[0]["prompt_id"] == "nudge"
    job = await isolated_db.get_job(first["job_id"])
    assert job is not None
    assert (job["content"], job["resume_id"]) == ("First JD", "r1")
    assert (first["status"], first["tailored_resume_id"], first["title"]) == (
        "completed",
        "tailored-1",
        "Dev @ Co",
    )
    assert (second["status"], second["tailored_resume_id"]) == (
        "completed",
        "tailored-2",
    )
    assert cooldowns == [3.0]


async def test_failed_item_is_recorded_and_the_queue_moves_on(
    isolated_db: Database,
    stub_pipeline: Callable[[Pipeline], None],
    cooldowns: list[float],
) -> None:
    seen: list[str] = []

    async def fail_first(
        *, resume_id: str, job_id: str, prompt_id: str | None
    ) -> tuple:
        del resume_id, prompt_id
        seen.append(job_id)
        if len(seen) == 1:
            raise RuntimeError("provider exploded")
        return ({"resume_id": "tailored-ok", "title": None}, {}, [], "", {})

    stub_pipeline(fail_first)
    await isolated_db.create_queue_item("q1", "r1", "First JD")
    await isolated_db.create_queue_item("q2", "r1", "Second JD")

    await QueueManager().drain()

    failed = await isolated_db.get_queue_item("q1")
    done = await isolated_db.get_queue_item("q2")
    assert failed is not None and failed["status"] == "failed"
    assert failed["error"]
    assert done is not None and done["status"] == "completed"
    assert cooldowns == [5.0, 5.0]


async def test_deleted_and_finished_items_are_never_claimed(
    isolated_db: Database,
    stub_pipeline: Callable[[Pipeline], None],
    calls: list[dict[str, Any]],
    cooldowns: list[float],
) -> None:
    await isolated_db.create_queue_item("gone", "r1", "Deleted JD")
    await isolated_db.delete_queue_item("gone")
    await isolated_db.create_queue_item("done", "r1", "Done JD")
    await isolated_db.update_queue_item("done", {"status": "completed"})

    await QueueManager().drain()

    assert calls == []
    assert cooldowns == []


async def test_recovery_covers_every_interrupted_and_old_pending_item(
    isolated_db: Database,
    stub_pipeline: Callable[[Pipeline], None],
    calls: list[dict[str, Any]],
    cooldowns: list[float],
) -> None:
    await isolated_db.create_queue_item("old-pending", "r1", "Old JD")
    await isolated_db.create_queue_item("interrupted", "r1", "Interrupted JD")
    await isolated_db.update_queue_item("interrupted", {"status": "processing"})
    # More finished rows than any list page, all newer than the stranded ones.
    for index in range(105):
        await isolated_db.create_queue_item(f"new-{index:03}", "r1", "Newer JD")
        await isolated_db.update_queue_item(f"new-{index:03}", {"status": "completed"})

    assert await isolated_db.requeue_interrupted_queue_items() == 1
    await QueueManager().drain()

    assert len(calls) == 2
    for item_id in ("old-pending", "interrupted"):
        item = await isolated_db.get_queue_item(item_id)
        assert item is not None and item["status"] == "completed"


async def test_started_worker_recovers_wakes_and_stops(
    isolated_db: Database,
    stub_pipeline: Callable[[Pipeline], None],
    cooldowns: list[float],
) -> None:
    await isolated_db.create_queue_item("interrupted", "r1", "Interrupted JD")
    await isolated_db.update_queue_item("interrupted", {"status": "processing"})
    manager = QueueManager()

    await manager.start()
    try:
        await _wait_for_status(isolated_db, "interrupted", "completed")
        await isolated_db.create_queue_item("later", "r1", "Later JD")
        manager.notify()
        await _wait_for_status(isolated_db, "later", "completed")
    finally:
        await manager.stop()

    assert manager._task is None


async def _wait_for_status(database: Database, item_id: str, status: str) -> None:
    async def poll() -> None:
        while True:
            item = await database.get_queue_item(item_id)
            if item is not None and item["status"] == status:
                return
            await asyncio.sleep(0.01)

    await asyncio.wait_for(poll(), timeout=5)


async def test_shutdown_mid_item_requeues_it_for_the_next_start(
    isolated_db: Database,
    stub_pipeline: Callable[[Pipeline], None],
    cooldowns: list[float],
) -> None:
    entered = asyncio.Event()

    async def hang(*, resume_id: str, job_id: str, prompt_id: str | None) -> tuple:
        del resume_id, job_id, prompt_id
        entered.set()
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    stub_pipeline(hang)
    await isolated_db.create_queue_item("q1", "r1", "First JD")
    drain = asyncio.create_task(QueueManager().drain())
    await asyncio.wait_for(entered.wait(), timeout=5)
    drain.cancel()
    with pytest.raises(asyncio.CancelledError):
        await drain

    item = await isolated_db.get_queue_item("q1")
    assert item is not None
    assert (item["status"], item["error"]) == ("pending", None)
    assert item["job_id"]
    assert cooldowns == []


async def test_recovered_item_reuses_a_resume_saved_before_the_interruption(
    isolated_db: Database,
    stub_pipeline: Callable[[Pipeline], None],
    calls: list[dict[str, Any]],
    cooldowns: list[float],
) -> None:
    job = await isolated_db.create_job("Saved JD", resume_id="r1")
    saved = await isolated_db.create_tailored_resume(
        request_id="req-1",
        original_resume_id="r1",
        job_id=job["job_id"],
        resume_fields={"content": "{}", "title": "Saved @ Co", "is_master": False},
        improvements=[],
    )
    await isolated_db.create_queue_item("q1", "r1", "Saved JD")
    await isolated_db.update_queue_item(
        "q1", {"status": "processing", "job_id": job["job_id"]}
    )

    await isolated_db.requeue_interrupted_queue_items()
    await QueueManager().drain()

    assert calls == []
    item = await isolated_db.get_queue_item("q1")
    assert item is not None
    assert (item["status"], item["tailored_resume_id"], item["title"]) == (
        "completed",
        saved["resume_id"],
        "Saved @ Co",
    )


async def test_each_item_runs_under_the_ai_operation_deadline(
    isolated_db: Database,
    stub_pipeline: Callable[[Pipeline], None],
    cooldowns: list[float],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.ai_budget import remaining_timeout
    from app.config import settings

    budgets: list[float] = []

    async def stall(*, resume_id: str, job_id: str, prompt_id: str | None) -> tuple:
        del resume_id, job_id, prompt_id
        budgets.append(remaining_timeout(preferred=60))
        await asyncio.sleep(30)
        raise AssertionError("unreachable")

    stub_pipeline(stall)
    monkeypatch.setattr(settings, "request_timeout_seconds", 0.2)
    await isolated_db.create_queue_item("q1", "r1", "First JD")

    await asyncio.wait_for(QueueManager().drain(), timeout=5)

    assert budgets and budgets[0] <= 0.2
    item = await isolated_db.get_queue_item("q1")
    assert item is not None and item["status"] == "failed"
