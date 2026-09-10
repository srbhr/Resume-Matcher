"""Preview/confirm contracts through real ASGI and temporary SQLite."""

import asyncio
import copy
import json
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapper

from app.database import Database
from app.main import app
from app.models import Improvement, Job, Resume, TailoringPreview
from app.preview import PreviewBusyError, PreviewConflictError
from app.routers import resumes
from app.schemas.models import ImproveDiffResult, ResumeChange, ResumeData


@pytest.fixture
async def confirmation_client(
    isolated_db: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    monkeypatch.setattr(resumes, "_load_config", lambda: {})
    monkeypatch.setattr(resumes, "get_content_language", lambda: "en")
    monkeypatch.setattr(
        resumes,
        "extract_job_keywords",
        AsyncMock(
            return_value={
                "keywords": ["Python"],
                "required_skills": [],
                "company": "Acme",
            }
        ),
    )
    monkeypatch.setattr(
        resumes, "generate_skill_target_plan", AsyncMock(return_value={"targets": []})
    )
    monkeypatch.setattr(
        resumes,
        "generate_resume_diffs",
        AsyncMock(return_value=ImproveDiffResult(changes=[])),
    )
    monkeypatch.setattr(
        resumes,
        "refine_resume",
        AsyncMock(side_effect=RuntimeError("synthetic unavailable refinement")),
    )
    monkeypatch.setattr(
        resumes, "generate_resume_title", AsyncMock(return_value="Engineer @ Acme")
    )
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        yield client


async def preview_payload(
    database: Database,
    client: AsyncClient,
    sample: dict[str, Any],
) -> dict[str, Any]:
    data = ResumeData.model_validate(copy.deepcopy(sample)).model_dump()
    source = await database.create_resume_atomic_master(
        content=json.dumps(data),
        processed_data=data,
        processing_status="ready",
    )
    job = await database.create_job("Python engineer at Acme")
    response = await client.post(
        "/api/v1/resumes/improve/preview",
        json={"resume_id": source["resume_id"], "job_id": job["job_id"]},
    )
    assert response.status_code == 200, response.text
    preview = response.json()["data"]
    payload = {
        "resume_id": source["resume_id"],
        "job_id": job["job_id"],
        "improved_data": preview["resume_preview"],
        "improvements": preview["improvements"],
    }
    assert preview["preview_id"]
    payload["preview_id"] = preview["preview_id"]
    return payload


async def test_replayed_confirmation_returns_identical_committed_result(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    first = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    # Simulate a lost response: caller sends the identical request again.
    second = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert first.status_code == second.status_code == 200
    assert second.json() == first.json()
    assert len(await isolated_db.list_resumes()) == 2
    assert len(await isolated_db.list_applications()) == 1
    async with isolated_db._session() as session:
        assert len(list((await session.execute(select(Improvement))).scalars())) == 1
    resumes.generate_resume_title.assert_awaited_once()


async def test_concurrent_confirmation_does_not_repeat_optional_generation(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    entered, release = asyncio.Event(), asyncio.Event()
    calls = 0

    async def title(*_args: Any, **_kwargs: Any) -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            entered.set()
            await release.wait()
        return "Engineer @ Acme"

    monkeypatch.setattr(resumes, "generate_resume_title", title)
    first_task = asyncio.create_task(
        confirmation_client.post("/api/v1/resumes/improve/confirm", json=payload)
    )
    await asyncio.wait_for(entered.wait(), 2)
    try:
        second = await confirmation_client.post(
            "/api/v1/resumes/improve/confirm", json=payload
        )
        assert second.status_code == 409
        assert second.headers.get("Retry-After")
        assert calls == 1
        other = Database(db_path=isolated_db.db_path)
        try:
            with pytest.raises(PreviewBusyError):
                await other.claim_preview(
                    preview_id=payload["preview_id"],
                    source_id=payload["resume_id"],
                    job_id=payload["job_id"],
                    payload_hash=resumes._hash_improved_data(payload["improved_data"]),
                    lease_seconds=30,
                )
        finally:
            await other.close()
    finally:
        release.set()
        first = await first_task
    replay = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert first.status_code == replay.status_code == 200
    assert first.json() == replay.json()
    assert len(await isolated_db.list_resumes()) == 2
    assert calls == 1


@pytest.mark.parametrize("target", ["source", "job"])
async def test_changed_inputs_invalidate_unconfirmed_preview(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    target: str,
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    if target == "source":
        changed = copy.deepcopy(sample_resume)
        changed["summary"] = "New source edit"
        await isolated_db.update_resume(
            payload["resume_id"], {"processed_data": changed}
        )
    else:
        await isolated_db.update_job(payload["job_id"], {"content": "Different job"})
    response = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert response.status_code == 409
    assert len(await isolated_db.list_resumes()) == 1
    resumes.generate_resume_title.assert_not_awaited()


@pytest.mark.parametrize("model", [Resume, Improvement])
@pytest.mark.parametrize("phase", ["before_insert", "after_insert"])
async def test_required_insert_failure_rolls_back_the_confirmation(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    model: type[Resume] | type[Improvement],
    phase: str,
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)

    def reject(_mapper: Mapper[Any], _connection: Connection, _target: Any) -> None:
        raise RuntimeError("synthetic required insert failure")

    event.listen(model, phase, reject)
    try:
        response = await confirmation_client.post(
            "/api/v1/resumes/improve/confirm", json=payload
        )
    finally:
        event.remove(model, phase, reject)
    assert response.status_code == 500
    assert len(await isolated_db.list_resumes()) == 1
    async with isolated_db._session() as session:
        assert list((await session.execute(select(Improvement))).scalars()) == []
    retry = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert retry.status_code == 200, retry.text
    assert len(await isolated_db.list_resumes()) == 2


async def test_acknowledged_metadata_updates_survive_concurrent_read_modify_write(
    isolated_db: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    job = await isolated_db.create_job("Python engineer")
    original_get = AsyncSession.get
    all_read, release = asyncio.Event(), asyncio.Event()
    reads = 0

    async def held_get(
        session: AsyncSession, entity: Any, ident: Any, **kwargs: Any
    ) -> Any:
        nonlocal reads
        result = await original_get(session, entity, ident, **kwargs)
        if entity is Job and ident == job["job_id"]:
            reads += 1
            if reads == 8:
                all_read.set()
            await release.wait()
        return result

    monkeypatch.setattr(AsyncSession, "get", held_get)
    tasks = [
        asyncio.create_task(isolated_db.update_job(job["job_id"], {f"field_{i}": i}))
        for i in range(8)
    ]
    try:
        await asyncio.wait_for(all_read.wait(), 0.3)
    except TimeoutError:
        pass  # A serialized writer lets only the first reader reach the barrier.
    finally:
        release.set()
    assert all(await asyncio.gather(*tasks))
    stored = await isolated_db.get_job(job["job_id"])
    assert stored is not None
    assert {key: stored.get(key) for key in [f"field_{i}" for i in range(8)]} == {
        f"field_{i}": i for i in range(8)
    }


async def test_independent_concurrent_previews_remain_confirmable(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed = await preview_payload(isolated_db, confirmation_client, sample_resume)
    entered = {key: asyncio.Event() for key in ["nudge", "keywords"]}
    release = {key: asyncio.Event() for key in entered}

    async def diffs(*_args: Any, **kwargs: Any) -> ImproveDiffResult:
        prompt = kwargs["prompt_id"]
        entered[prompt].set()
        await release[prompt].wait()
        return ImproveDiffResult(
            changes=[
                ResumeChange(
                    path="summary",
                    action="replace",
                    original=sample_resume["summary"],
                    value=sample_resume["summary"] + f" {prompt} wording.",
                    reason="Clarify summary",
                )
            ]
        )

    monkeypatch.setattr(resumes, "generate_resume_diffs", diffs)
    tasks = {
        key: asyncio.create_task(
            confirmation_client.post(
                "/api/v1/resumes/improve/preview",
                json={
                    "resume_id": seed["resume_id"],
                    "job_id": seed["job_id"],
                    "prompt_id": key,
                },
            )
        )
        for key in entered
    }
    await asyncio.wait_for(
        asyncio.gather(*(event.wait() for event in entered.values())), 2
    )
    try:
        release["nudge"].set()
        first = await tasks["nudge"]
        release["keywords"].set()
        second = await tasks["keywords"]
    finally:
        for event in release.values():
            event.set()
        await asyncio.gather(*tasks.values())
    for response in [first, second]:
        assert response.status_code == 200, response.text
        preview = response.json()["data"]
        result = await confirmation_client.post(
            "/api/v1/resumes/improve/confirm",
            json={
                **seed,
                "preview_id": preview["preview_id"],
                "improved_data": preview["resume_preview"],
                "improvements": preview["improvements"],
            },
        )
        assert result.status_code == 200, result.text
    job = await isolated_db.get_job(seed["job_id"])
    assert job is not None and set(job["preview_hashes"]) >= {"nudge", "keywords"}
    assert len(await isolated_db.list_resumes()) == 3


@pytest.mark.parametrize("change", ["payload", "source_id", "expired"])
async def test_preview_binding_and_expiry_are_enforced(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    change: str,
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    assert payload["preview_id"]
    if change == "payload":
        payload["improved_data"]["summary"] = "Tampered output"
    elif change == "source_id":
        other = await isolated_db.create_resume(
            content=json.dumps(sample_resume),
            processed_data=sample_resume,
            processing_status="ready",
        )
        payload["resume_id"] = other["resume_id"]
    else:
        async with isolated_db._session() as session:
            row = await session.get(TailoringPreview, payload["preview_id"])
            assert row is not None
            row.expires_at = (
                datetime.now(timezone.utc) - timedelta(seconds=1)
            ).isoformat()
            await session.commit()
    response = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert response.status_code == (400 if change == "payload" else 409), response.text
    resumes.generate_resume_title.assert_not_awaited()


async def test_committed_replay_survives_later_input_changes_and_expiry(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    first = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert first.status_code == 200
    await isolated_db.update_resume(
        payload["resume_id"],
        {"processed_data": {"personalInfo": {"name": "Renamed source"}}},
    )
    await isolated_db.update_job(payload["job_id"], {"content": "Edited job"})
    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, payload["preview_id"])
        assert row is not None
        row.expires_at = "2000-01-01T00:00:00+00:00"
        await session.commit()
    payload["improvements"] = [{"suggestion": "Different retry metadata"}]
    second = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert second.status_code == 200, second.text
    assert second.json() == first.json()
    resumes.generate_resume_title.assert_awaited_once()


async def test_source_edit_during_confirmation_prevents_stale_commit(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)

    async def title(*_args: Any, **_kwargs: Any) -> str:
        await isolated_db.update_resume(
            payload["resume_id"], {"content": "edited during AI"}
        )
        return "Engineer @ Acme"

    monkeypatch.setattr(resumes, "generate_resume_title", title)
    result = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert result.status_code == 409, result.text
    assert len(await isolated_db.list_resumes()) == 1


async def test_cancellation_releases_uncommitted_claim(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    entered = asyncio.Event()

    async def title(*_args: Any, **_kwargs: Any) -> str:
        entered.set()
        await asyncio.Event().wait()
        return "unreachable"

    monkeypatch.setattr(resumes, "generate_resume_title", title)
    pending = asyncio.create_task(
        confirmation_client.post("/api/v1/resumes/improve/confirm", json=payload)
    )
    await asyncio.wait_for(entered.wait(), 2)
    pending.cancel()
    with pytest.raises(asyncio.CancelledError):
        await pending
    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, payload["preview_id"])
        assert row is not None and row.claim_token is None
    assert len(await isolated_db.list_resumes()) == 1
    monkeypatch.setattr(
        resumes, "generate_resume_title", AsyncMock(return_value="Retry title")
    )
    retry = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert retry.status_code == 200, retry.text


async def test_deleted_result_is_not_recreated_or_retained_in_replay_storage(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    first = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert first.status_code == 200
    await isolated_db.delete_resume(first.json()["data"]["resume_id"])
    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, payload["preview_id"])
        assert row is not None and row.response_data is None
    replay = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert replay.status_code == 409
    assert len(await isolated_db.list_resumes()) == 1
    resumes.generate_resume_title.assert_awaited_once()


async def test_new_explicit_preview_recovers_after_deleted_tokenless_result(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    first = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert first.status_code == 200, first.text
    deleted_id = first.json()["data"]["resume_id"]
    deleted = await confirmation_client.delete(f"/api/v1/resumes/{deleted_id}")
    assert deleted.status_code == 200, deleted.text

    preview = await confirmation_client.post(
        "/api/v1/resumes/improve/preview",
        json={"resume_id": payload["resume_id"], "job_id": payload["job_id"]},
    )
    assert preview.status_code == 200, preview.text
    fresh = preview.json()["data"]
    assert fresh["preview_id"] != payload["preview_id"]
    assert fresh["resume_preview"] == payload["improved_data"]

    # Without an operation ID the server cannot distinguish a lost old retry
    # from acceptance of this new identical proposal. Do not resurrect the old one.
    tokenless = {key: value for key, value in payload.items() if key != "preview_id"}
    replay = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=tokenless
    )
    assert replay.status_code == 409, replay.text
    assert len(await isolated_db.list_resumes()) == 1
    resumes.generate_resume_title.assert_awaited_once()

    fresh_payload = {**payload, "preview_id": fresh["preview_id"]}
    confirmed = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=fresh_payload
    )
    assert confirmed.status_code == 200, confirmed.text
    new_id = confirmed.json()["data"]["resume_id"]
    assert new_id != deleted_id
    assert await isolated_db.get_resume(deleted_id) is None
    assert {row["resume_id"] for row in await isolated_db.list_resumes()} == {
        payload["resume_id"], new_id,
    }
    repeated = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=fresh_payload
    )
    assert repeated.json() == confirmed.json()
    assert resumes.generate_resume_title.await_count == 2
    async with isolated_db._session() as session:
        old = await session.get(TailoringPreview, payload["preview_id"])
        assert old is not None and old.response_data is None
        assert old.result_resume_id == deleted_id


async def test_expired_claim_can_be_recovered_without_old_owner_committing_or_releasing_it(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    kwargs = dict(
        preview_id=payload["preview_id"],
        source_id=payload["resume_id"],
        job_id=payload["job_id"],
        payload_hash=resumes._hash_improved_data(payload["improved_data"]),
        lease_seconds=30,
    )
    old = await isolated_db.claim_preview(**kwargs)
    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, payload["preview_id"])
        assert row is not None
        row.claim_expires_at = "2000-01-01T00:00:00+00:00"
        await session.commit()
    current = await isolated_db.claim_preview(**kwargs)
    assert current.token != old.token
    with pytest.raises(PreviewConflictError):
        await isolated_db.complete_preview(
            claim=old, resume_fields={}, response_data={}, improvements=[]
        )
    await isolated_db.release_preview_claim(old)
    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, payload["preview_id"])
        assert row is not None and row.claim_token == current.token
    await isolated_db.release_preview_claim(current)
    assert len(await isolated_db.list_resumes()) == 1


async def test_timed_out_generation_releases_claim_and_creates_no_required_rows(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    monkeypatch.setattr(resumes.settings, "request_timeout_seconds", 1)

    async def title(*_args: Any, **_kwargs: Any) -> str:
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            # Optional generation now has its own earlier deadline. Simulate a
            # provider cleanup that outlasts that reserve to reach the actual
            # request deadline, retaining the original no-orphan assertions.
            await asyncio.sleep(0.4)
            raise
        return "unreachable"

    monkeypatch.setattr(resumes, "generate_resume_title", title)
    response = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert response.status_code == 504
    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, payload["preview_id"])
        assert row is not None and row.claim_token is None
    assert len(await isolated_db.list_resumes()) == 1


async def test_preview_registration_failure_is_not_acknowledged_as_a_valid_preview(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
) -> None:
    seed = await preview_payload(isolated_db, confirmation_client, sample_resume)

    def reject(
        _mapper: Mapper[Any], _connection: Connection, _target: TailoringPreview
    ) -> None:
        raise RuntimeError("synthetic preview registration failure")

    event.listen(TailoringPreview, "before_insert", reject)
    try:
        response = await confirmation_client.post(
            "/api/v1/resumes/improve/preview",
            json={"resume_id": seed["resume_id"], "job_id": seed["job_id"]},
        )
    finally:
        event.remove(TailoringPreview, "before_insert", reject)
    assert response.status_code == 500
    async with isolated_db._session() as session:
        assert (
            len(list((await session.execute(select(TailoringPreview))).scalars())) == 1
        )


async def test_source_edit_during_preview_requires_recomputation(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed = await preview_payload(isolated_db, confirmation_client, sample_resume)

    async def diffs(*_args: Any, **_kwargs: Any) -> ImproveDiffResult:
        await isolated_db.update_resume(
            seed["resume_id"], {"original_markdown": "New original date source"}
        )
        return ImproveDiffResult(changes=[])

    monkeypatch.setattr(resumes, "generate_resume_diffs", diffs)
    response = await confirmation_client.post(
        "/api/v1/resumes/improve/preview",
        json={"resume_id": seed["resume_id"], "job_id": seed["job_id"]},
    )
    assert response.status_code == 409
    async with isolated_db._session() as session:
        assert (
            len(list((await session.execute(select(TailoringPreview))).scalars())) == 1
        )


async def test_full_data_reset_removes_confirmation_replay_content(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    response = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert response.status_code == 200
    await isolated_db.reset_database()
    async with isolated_db._session() as session:
        assert list((await session.execute(select(TailoringPreview))).scalars()) == []
    assert await isolated_db.list_resumes() == []


async def test_confirmation_uses_registered_suggestions(isolated_db: Database, confirmation_client: AsyncClient, sample_resume: dict[str, Any]) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    expected = copy.deepcopy(payload["improvements"])
    payload["improvements"] = [{"suggestion": "Injected unregistered suggestion", "lineNumber": None}]
    result = await confirmation_client.post("/api/v1/resumes/improve/confirm", json=payload)
    assert result.status_code == 200, result.text
    assert result.json()["data"]["improvements"] == expected


async def test_replay_repairs_tracker_card_after_lost_followup(isolated_db: Database, confirmation_client: AsyncClient, sample_resume: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    with monkeypatch.context() as stage:
        stage.setattr(resumes, "_auto_create_tracker_application", AsyncMock(return_value=None))
        first = await confirmation_client.post("/api/v1/resumes/improve/confirm", json=payload)
    assert first.status_code == 200 and await isolated_db.list_applications() == []
    second = await confirmation_client.post("/api/v1/resumes/improve/confirm", json=payload)
    assert second.json() == first.json()
    cards = await isolated_db.list_applications()
    assert len(cards) == 1
    saved = await isolated_db.get_resume(first.json()["data"]["resume_id"])
    assert saved is not None and saved["title"] == "Engineer @ Acme"
    assert cards[0]["role"] == saved["title"]


async def test_tokenless_replay_prefers_confirmed_over_new_identical_preview(isolated_db: Database, confirmation_client: AsyncClient, sample_resume: dict[str, Any]) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    first = await confirmation_client.post("/api/v1/resumes/improve/confirm", json=payload)
    assert first.status_code == 200
    new_preview = await confirmation_client.post("/api/v1/resumes/improve/preview", json={"resume_id": payload["resume_id"], "job_id": payload["job_id"]})
    assert new_preview.status_code == 200
    payload.pop("preview_id")
    replay = await confirmation_client.post("/api/v1/resumes/improve/confirm", json=payload)
    assert replay.json() == first.json()
    assert len(await isolated_db.list_resumes()) == 2


@pytest.mark.parametrize("section", ["languages", "certificationsTraining", "awards"])
async def test_legacy_registered_preview_cannot_persist_unsupported_additions(isolated_db: Database, confirmation_client: AsyncClient, sample_resume: dict[str, Any], section: str) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    payload["improved_data"]["additional"][section].append("Unsupported synthetic qualification")
    async with isolated_db._session() as session:
        row = await session.get(TailoringPreview, payload["preview_id"])
        assert row is not None
        row.payload_hash = resumes._hash_improved_data(payload["improved_data"])
        await session.commit()
    response = await confirmation_client.post("/api/v1/resumes/improve/confirm", json=payload)
    assert response.status_code == 400, response.text
    assert len(await isolated_db.list_resumes()) == 1


async def test_legacy_preview_without_structured_source_requires_reprocessing(isolated_db: Database, confirmation_client: AsyncClient, sample_resume: dict[str, Any]) -> None:
    from app.preview import job_fingerprint, resume_fingerprint
    source = await isolated_db.create_resume(content="# Original unprocessed resume", processing_status="failed")
    job = await isolated_db.create_job("Synthetic engineer")
    candidate = ResumeData.model_validate(sample_resume).model_dump()
    preview = await isolated_db.register_preview(source_id=source["resume_id"], job_id=job["job_id"], payload_hash=resumes._hash_improved_data(candidate), source_hash=resume_fingerprint(source["content"], None, None), job_hash=job_fingerprint(job["content"]), prompt_id="nudge", ttl_seconds=60)
    response = await confirmation_client.post("/api/v1/resumes/improve/confirm", json={"resume_id": source["resume_id"], "job_id": job["job_id"], "preview_id": preview["preview_id"], "improved_data": candidate, "improvements": []})
    assert response.status_code == 400, response.text
    assert len(await isolated_db.list_resumes()) == 1


@pytest.mark.parametrize(
    ("appended_text", "retained"),
    [
        ("Built Python automation", True),
        ("Generated $990000 in new revenue", False),
    ],
)
async def test_verified_description_append_survives_preview_and_confirmation(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    appended_text: str,
    retained: bool,
) -> None:
    monkeypatch.setattr(
        resumes,
        "generate_resume_diffs",
        AsyncMock(return_value=ImproveDiffResult(changes=[ResumeChange(
            path="workExperience[0].description",
            action="append",
            value=appended_text,
            reason="Summarize relevant source experience",
        )])),
    )
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    descriptions = payload["improved_data"]["workExperience"][0]["description"]
    assert (appended_text in descriptions) is retained
    response = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert response.status_code == 200, response.text
    saved = await isolated_db.get_resume(response.json()["data"]["resume_id"])
    assert saved is not None
    assert saved["processed_data"]["workExperience"][0]["description"] == descriptions


async def test_optional_title_timeout_can_still_commit_required_resume(
    isolated_db: Database,
    confirmation_client: AsyncClient,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = await preview_payload(isolated_db, confirmation_client, sample_resume)
    monkeypatch.setattr(resumes.settings, "request_timeout_seconds", 1)

    async def stalled_title(*_args: Any, **_kwargs: Any) -> str:
        await asyncio.Event().wait()
        return "unreachable"

    monkeypatch.setattr(resumes, "generate_resume_title", stalled_title)
    response = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert response.status_code == 200, response.text
    assert "Title generation failed" in response.json()["data"]["warnings"]
    assert len(await isolated_db.list_resumes()) == 2
    replay = await confirmation_client.post(
        "/api/v1/resumes/improve/confirm", json=payload
    )
    assert replay.json() == response.json()
