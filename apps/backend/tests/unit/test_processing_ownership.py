"""SQLite processing-token migration and compare-and-set tests."""

from pathlib import Path

from app.database import Database
from app.db_engine import init_models_sync, make_sync_engine


def test_processing_token_migration_is_idempotent(tmp_path: Path) -> None:
    """Existing resume tables gain exactly one nullable ownership column."""
    engine = make_sync_engine(tmp_path / "legacy.db")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                """
                CREATE TABLE resumes (
                    resume_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    content_type TEXT DEFAULT 'md'
                )
                """
            )

        init_models_sync(engine)
        init_models_sync(engine)

        with engine.begin() as connection:
            columns = (
                connection.exec_driver_sql("PRAGMA table_info(resumes)")
                .mappings()
                .all()
            )
        names = [column["name"] for column in columns]
        assert names.count("processing_token") == 1
    finally:
        engine.dispose()


async def test_only_latest_processing_token_can_finish(tmp_path: Path) -> None:
    """The real database rejects completion from a superseded operation."""
    database = Database(db_path=tmp_path / "ownership.db")
    try:
        resume = await database.create_resume(
            content="# Ada", processing_status="failed"
        )
        older = await database.claim_resume_processing(resume["resume_id"])
        newer = await database.claim_resume_processing(resume["resume_id"])
        assert older is not None and newer is not None and older != newer

        stale = await database.finish_resume_processing(
            resume["resume_id"],
            older,
            processing_status="ready",
            processed_data={"summary": "stale"},
        )
        committed = await database.finish_resume_processing(
            resume["resume_id"], newer, processing_status="failed"
        )

        assert stale == "stale"
        assert committed == "committed"
        stored = await database.get_resume(resume["resume_id"])
        assert stored is not None
        assert stored["processing_status"] == "failed"
        assert stored["processed_data"] is None
    finally:
        await database.close()


async def test_failed_processing_clears_previous_structured_data(
    tmp_path: Path,
) -> None:
    database = Database(db_path=tmp_path / "failed.db")
    try:
        row = await database.create_resume(
            content="old", processing_status="failed", processed_data={"summary": "old"}
        )
        token = await database.claim_resume_processing(row["resume_id"])
        assert token is not None
        assert (
            await database.finish_resume_processing(
                row["resume_id"], token, processing_status="failed"
            )
            == "committed"
        )
        stored = await database.get_resume(row["resume_id"])
        assert stored is not None and stored["processed_data"] is None
    finally:
        await database.close()


async def test_user_save_supersedes_active_processing(tmp_path: Path) -> None:
    database = Database(db_path=tmp_path / "edit.db")
    try:
        row = await database.create_resume(content="old", processing_status="failed")
        token = await database.claim_resume_processing(row["resume_id"])
        assert token is not None
        await database.update_resume(
            row["resume_id"],
            {"processing_status": "ready", "processed_data": {"summary": "user edit"}},
        )
        assert (
            await database.finish_resume_processing(
                row["resume_id"],
                token,
                processing_status="ready",
                processed_data={"summary": "late parser"},
            )
            == "stale"
        )
        stored = await database.get_resume(row["resume_id"])
        assert stored is not None and stored["processed_data"] == {
            "summary": "user edit"
        }
    finally:
        await database.close()
