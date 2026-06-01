"""Tests for the real TinyDB layer (app.database.Database).

Every integration test mocks `db`, so the actual persistence layer (34% cover)
was never exercised. These run a real TinyDB against a temp file, so CRUD,
master-resume assignment, and stats are verified end-to-end on the storage.
"""

import pytest

from app.database import Database


@pytest.fixture
def db(tmp_path):
    database = Database(db_path=tmp_path / "test_db.json")
    yield database
    database.close()


class TestResumeCrud:
    def test_create_and_get(self, db):
        created = db.create_resume(content="# Resume", filename="r.pdf")
        assert created["resume_id"]
        fetched = db.get_resume(created["resume_id"])
        assert fetched is not None
        assert fetched["content"] == "# Resume"
        assert fetched["filename"] == "r.pdf"

    def test_get_missing_returns_none(self, db):
        assert db.get_resume("does-not-exist") is None

    def test_list_resumes(self, db):
        db.create_resume(content="a")
        db.create_resume(content="b")
        assert len(db.list_resumes()) == 2

    def test_update_resume_changes_field_and_timestamp(self, db):
        created = db.create_resume(content="x")
        updated = db.update_resume(created["resume_id"], {"title": "New Title"})
        assert updated["title"] == "New Title"
        assert updated["updated_at"] >= created["updated_at"]

    def test_update_missing_raises(self, db):
        with pytest.raises(ValueError):
            db.update_resume("missing", {"title": "X"})

    def test_delete_resume(self, db):
        created = db.create_resume(content="x")
        assert db.delete_resume(created["resume_id"]) is True
        assert db.get_resume(created["resume_id"]) is None

    def test_delete_missing_returns_false(self, db):
        assert db.delete_resume("missing") is False


class TestMasterResume:
    def test_no_master_initially(self, db):
        assert db.get_master_resume() is None

    def test_set_master_unsets_previous(self, db):
        r1 = db.create_resume(content="1")
        r2 = db.create_resume(content="2")

        assert db.set_master_resume(r1["resume_id"]) is True
        assert db.get_master_resume()["resume_id"] == r1["resume_id"]

        assert db.set_master_resume(r2["resume_id"]) is True
        master = db.get_master_resume()
        assert master["resume_id"] == r2["resume_id"]
        # Only one master at a time.
        assert sum(1 for r in db.list_resumes() if r["is_master"]) == 1

    def test_set_master_missing_returns_false(self, db):
        assert db.set_master_resume("missing") is False

    async def test_atomic_first_upload_becomes_master(self, db):
        created = await db.create_resume_atomic_master(content="first", processing_status="ready")
        assert created["is_master"] is True

    async def test_atomic_second_upload_not_master(self, db):
        await db.create_resume_atomic_master(content="first", processing_status="ready")
        second = await db.create_resume_atomic_master(content="second", processing_status="ready")
        assert second["is_master"] is False

    async def test_atomic_recovers_when_master_stuck(self, db):
        # Master stuck in "failed" → next upload is promoted to master.
        first = await db.create_resume_atomic_master(content="first", processing_status="failed")
        assert first["is_master"] is True
        second = await db.create_resume_atomic_master(content="second", processing_status="ready")
        assert second["is_master"] is True
        assert db.get_master_resume()["resume_id"] == second["resume_id"]


class TestJobs:
    def test_create_and_get_job(self, db):
        created = db.create_job(content="Engineer role", resume_id="r1")
        fetched = db.get_job(created["job_id"])
        assert fetched["content"] == "Engineer role"
        assert fetched["resume_id"] == "r1"

    def test_get_missing_job_returns_none(self, db):
        assert db.get_job("missing") is None

    def test_update_job(self, db):
        created = db.create_job(content="old")
        updated = db.update_job(created["job_id"], {"content": "new"})
        assert updated["content"] == "new"

    def test_update_missing_job_returns_none(self, db):
        assert db.update_job("missing", {"content": "x"}) is None


class TestImprovements:
    def test_create_and_lookup_by_tailored_resume(self, db):
        db.create_improvement(
            original_resume_id="orig",
            tailored_resume_id="tailored-1",
            job_id="job-1",
            improvements=[{"path": "summary"}],
        )
        found = db.get_improvement_by_tailored_resume("tailored-1")
        assert found is not None
        assert found["job_id"] == "job-1"

    def test_lookup_missing_returns_none(self, db):
        assert db.get_improvement_by_tailored_resume("nope") is None


class TestStatsAndReset:
    def test_get_stats(self, db):
        db.create_resume(content="a")
        db.set_master_resume(db.list_resumes()[0]["resume_id"])
        db.create_job(content="jd")
        stats = db.get_stats()
        assert stats["total_resumes"] == 1
        assert stats["total_jobs"] == 1
        assert stats["has_master_resume"] is True

    def test_reset_database_truncates(self, db, tmp_path, monkeypatch):
        # reset_database also clears settings.data_dir/uploads — isolate it to tmp.
        monkeypatch.setattr("app.database.settings.data_dir", tmp_path)
        db.create_resume(content="a")
        db.create_job(content="jd")
        db.reset_database()
        stats = db.get_stats()
        assert stats["total_resumes"] == 0
        assert stats["total_jobs"] == 0
        assert stats["has_master_resume"] is False
