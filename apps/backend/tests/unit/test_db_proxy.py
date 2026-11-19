"""`app.database.db` is a proxy, so one swap reaches every module that imported it."""

from pathlib import Path

import pytest

from app import database as database_module
from app.database import Database, db, set_database


async def test_set_database_redirects_modules_that_imported_db_earlier(
    tmp_path: Path,
) -> None:
    from app.routers import resumes as resumes_router

    first = Database(db_path=tmp_path / "first.db")
    second = Database(db_path=tmp_path / "second.db")
    previous = set_database(first)
    try:
        created = await db.create_resume(content="# A")
        # The router bound `db` at import time; it still reaches the current instance.
        assert await resumes_router.db.get_resume(created["resume_id"]) is not None

        assert set_database(second) is first
        assert await resumes_router.db.get_resume(created["resume_id"]) is None
        assert await first.get_resume(created["resume_id"]) is not None
    finally:
        set_database(previous)
        await first.close()
        await second.close()


def test_attribute_writes_reach_the_current_instance(tmp_path: Path) -> None:
    target = Database(db_path=tmp_path / "t.db")
    previous = set_database(target)
    try:
        db.lock_timeout_ms = 123
        assert target.lock_timeout_ms == 123
        assert database_module.db.lock_timeout_ms == 123
    finally:
        set_database(previous)


def test_a_method_patched_on_db_is_restored_when_the_patch_is_undone() -> None:
    # pytest 9.2 undoes an instance patch by deleting the attribute again, so the
    # proxy must forward deletes to the current database.
    def fake_stats() -> dict[str, int]:
        return {"total_resumes": -1}

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(db, "get_stats", fake_stats)
        assert db.get_stats is fake_stats

    assert db.get_stats.__func__ is Database.get_stats
