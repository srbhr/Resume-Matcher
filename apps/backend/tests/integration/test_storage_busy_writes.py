"""Real SQLite contention must reach write callers as a retryable outcome."""

from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, text
from sqlalchemy.exc import OperationalError

from app.config import get_api_keys_from_config, save_api_keys_to_config
from app.database import Database, DatabaseBusyError
from app.main import app


@pytest.fixture
def fast_busy_database(isolated_db: Database) -> Iterator[Database]:
    """Keep real SQLite locks, shortening only the busy wait on test connections."""
    isolated_db._ensure_initialized()
    assert isolated_db._async_engine is not None
    assert isolated_db._sync_engine is not None
    engines = [isolated_db._async_engine.sync_engine, isolated_db._sync_engine]

    def set_short_wait(connection: Any, record: Any, proxy: Any) -> None:
        del record, proxy
        cursor = connection.cursor()
        try:
            cursor.execute("PRAGMA busy_timeout=10")
        finally:
            cursor.close()

    for engine in engines:
        event.listen(engine, "checkout", set_short_wait)
    try:
        yield isolated_db
    finally:
        for engine in engines:
            event.remove(engine, "checkout", set_short_wait)


@pytest.mark.parametrize(
    "operation",
    [
        "jobs_upload",
        "resume_title",
        "resume_delete",
        "resume_retry",
        "key_save",
        "key_delete",
        "key_clear",
    ],
)
async def test_contended_public_write_returns_503_and_can_be_retried(
    fast_busy_database: Database,
    monkeypatch: pytest.MonkeyPatch,
    sample_resume: dict[str, Any],
    operation: str,
) -> None:
    database = fast_busy_database
    row = await database.create_resume(
        content="Synthetic resume", processing_status="failed", title="Original"
    )
    save_api_keys_to_config({"openai": "synthetic-original-key"})
    monkeypatch.setattr(
        "app.routers.resumes.parse_resume_to_json",
        AsyncMock(return_value=sample_resume),
    )
    resume_url = f"/api/v1/resumes/{row['resume_id']}"
    requests: dict[str, tuple[str, str, dict[str, Any] | None]] = {
        "jobs_upload": (
            "POST", "/api/v1/jobs/upload", {"job_descriptions": ["Synthetic engineer"]}
        ),
        "resume_title": ("PATCH", f"{resume_url}/title", {"title": "Changed"}),
        "resume_delete": ("DELETE", resume_url, None),
        "resume_retry": ("POST", f"{resume_url}/retry-processing", None),
        "key_save": (
            "POST", "/api/v1/config/api-keys", {"openai": "synthetic-new-key"}
        ),
        "key_delete": ("DELETE", "/api/v1/config/api-keys/openai", None),
        "key_clear": ("DELETE", "/api/v1/config/api-keys?confirm=CLEAR_ALL_KEYS", None),
    }
    method, url, payload = requests[operation]
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        async with database._session() as writer:
            await writer.execute(text("BEGIN IMMEDIATE"))
            response = await client.request(method, url, json=payload)
            # WAL readers remain available; read behavior is not redesigned.
            assert (await client.get("/api/v1/resumes/list")).status_code == 200
        assert response.status_code == 503, response.text
        assert response.headers["retry-after"] == "1"
        assert "database is locked" not in response.text.lower()
        unchanged = await database.get_resume(row["resume_id"])
        assert unchanged is not None
        assert unchanged["title"] == "Original"
        assert unchanged["processing_status"] == "failed"
        assert (await database.get_stats())["total_jobs"] == 0
        assert get_api_keys_from_config() == {"openai": "synthetic-original-key"}

        retried = await client.request(method, url, json=payload)
        assert retried.status_code == 200, retried.text


@pytest.mark.parametrize(
    "operation",
    [
        "create_resume",
        "update_job",
        "delete_job",
        "finish_processing",
        "create_improvement",
        "upsert_key",
        "reset",
    ],
)
async def test_non_endpoint_writers_translate_busy_without_partial_changes(
    fast_busy_database: Database,
    operation: str,
) -> None:
    database = fast_busy_database
    row = await database.create_resume(
        content="Synthetic original", processing_status="failed"
    )
    token = await database.claim_resume_processing(row["resume_id"])
    assert token is not None
    job = await database.create_job("Synthetic job")
    database.set_api_key_ciphertext("openai", "original-ciphertext")

    async def mutate() -> None:
        if operation == "create_resume":
            await database.create_resume(content="Should not persist")
        elif operation == "update_job":
            await database.update_job(job["job_id"], {"company": "Should not persist"})
        elif operation == "delete_job":
            await database.delete_job(job["job_id"])
        elif operation == "finish_processing":
            await database.finish_resume_processing(
                row["resume_id"],
                token,
                processing_status="ready",
                processed_data={"summary": "changed"},
            )
        elif operation == "create_improvement":
            await database.create_improvement(
                row["resume_id"], row["resume_id"], job["job_id"], []
            )
        elif operation == "upsert_key":
            database.set_api_key_ciphertext("openai", "changed-ciphertext")
        else:
            await database.reset_database()

    async with database._session() as writer:
        await writer.execute(text("BEGIN IMMEDIATE"))
        with pytest.raises(DatabaseBusyError):
            await mutate()

    assert (await database.get_stats())["total_resumes"] == 1
    assert (await database.get_stats())["total_jobs"] == 1
    assert (await database.get_stats())["total_improvements"] == 0
    stored = await database.get_resume(row["resume_id"])
    assert stored is not None and stored["processing_status"] == "processing"
    assert (await database.get_job(job["job_id"])) == job
    assert database.get_api_key_ciphertexts() == {"openai": "original-ciphertext"}
    # A failed finish does not consume ownership; the unchanged token can retry.
    assert await database.finish_resume_processing(
        row["resume_id"], token, processing_status="failed"
    ) == "committed"


async def test_non_busy_sqlite_write_error_is_not_marked_retryable(
    fast_busy_database: Database,
) -> None:
    with pytest.raises(OperationalError):
        async with fast_busy_database._write_session() as session:
            await session.execute(
                text("INSERT INTO synthetic_missing_table VALUES (1)")
            )
