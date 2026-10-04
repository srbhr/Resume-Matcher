"""Tests for the real SQLAlchemy/SQLite layer (app.database.Database).

Every integration test mocks `db`, so the actual persistence layer was barely
exercised. These run a real SQLite database against a temp file, so CRUD,
master-resume assignment, the jobs ``metadata_json`` round-trip, applications,
and stats are verified end-to-end on the storage.
"""

from pathlib import Path

import pytest
import sqlalchemy.exc
from sqlalchemy.engine import Engine

from app.database import Database
from app.db_engine import init_models_sync, make_sync_engine


@pytest.fixture
async def db(tmp_path):
    database = Database(db_path=tmp_path / "test_db.db")
    yield database
    await database.close()


class TestResumeCrud:
    async def test_create_and_get(self, db):
        created = await db.create_resume(content="# Resume", filename="r.pdf")
        assert created["resume_id"]
        fetched = await db.get_resume(created["resume_id"])
        assert fetched is not None
        assert fetched["content"] == "# Resume"
        assert fetched["filename"] == "r.pdf"

    async def test_get_missing_returns_none(self, db):
        assert await db.get_resume("does-not-exist") is None

    async def test_list_resumes(self, db):
        await db.create_resume(content="a")
        await db.create_resume(content="b")
        assert len(await db.list_resumes()) == 2

    async def test_update_resume_changes_field_and_timestamp(self, db):
        created = await db.create_resume(content="x")
        updated = await db.update_resume(created["resume_id"], {"title": "New Title"})
        assert updated["title"] == "New Title"
        assert updated["updated_at"] >= created["updated_at"]

    async def test_update_missing_raises(self, db):
        with pytest.raises(ValueError):
            await db.update_resume("missing", {"title": "X"})

    async def test_delete_resume(self, db):
        created = await db.create_resume(content="x")
        assert await db.delete_resume(created["resume_id"]) is True
        assert await db.get_resume(created["resume_id"]) is None

    async def test_delete_missing_returns_false(self, db):
        assert await db.delete_resume("missing") is False

    async def test_original_markdown_absence_semantics(self, db):
        # Omitted when None (preserve TinyDB behavior); present when supplied.
        without = await db.create_resume(content="x")
        assert "original_markdown" not in without
        with_md = await db.create_resume(content="x", original_markdown="# raw")
        fetched = await db.get_resume(with_md["resume_id"])
        assert fetched["original_markdown"] == "# raw"

    async def test_interview_prep_round_trips_as_text(self, db):
        created = await db.create_resume(
            content="x",
            interview_prep='{"role_fit_analysis":["fit"]}',
        )
        fetched = await db.get_resume(created["resume_id"])
        assert fetched["interview_prep"] == '{"role_fit_analysis":["fit"]}'

    def test_interview_prep_migration_is_idempotent(self, tmp_path):
        engine = make_sync_engine(tmp_path / "old.db")
        try:
            with engine.begin() as conn:
                conn.exec_driver_sql(
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

            with engine.begin() as conn:
                columns = (
                    conn.exec_driver_sql("PRAGMA table_info(resumes)").mappings().all()
                )
            names = [column["name"] for column in columns]
            assert names.count("interview_prep") == 1
        finally:
            engine.dispose()


class TestMasterResume:
    async def test_no_master_initially(self, db):
        assert await db.get_master_resume() is None

    async def test_set_default_unsets_previous_default(self, db: Database) -> None:
        r1 = await db.create_resume_atomic_master(
            content="1", processing_status="ready"
        )
        r2 = await db.create_resume_atomic_master(
            content="2", processing_status="ready"
        )
        assert (await db.get_master_resume())["resume_id"] == r1["resume_id"]

        assert await db.set_default_master_resume(r2["resume_id"]) is True
        assert (await db.get_master_resume())["resume_id"] == r2["resume_id"]
        rows = await db.list_resumes()
        assert sum(1 for r in rows if r["is_default_master"]) == 1
        assert sum(1 for r in rows if r["is_master"]) == 2

    async def test_set_default_missing_or_non_master_returns_false(
        self, db: Database
    ) -> None:
        plain = await db.create_resume(content="plain")
        assert await db.set_default_master_resume("missing") is False
        assert await db.set_default_master_resume(plain["resume_id"]) is False

    async def test_atomic_first_upload_becomes_default_master(
        self, db: Database
    ) -> None:
        created = await db.create_resume_atomic_master(
            content="first", processing_status="ready"
        )
        assert created["is_master"] is True
        assert created["is_default_master"] is True

    async def test_atomic_second_upload_is_additional_non_default_master(
        self, db: Database
    ) -> None:
        await db.create_resume_atomic_master(content="first", processing_status="ready")
        second = await db.create_resume_atomic_master(
            content="second", processing_status="ready"
        )
        assert second["is_master"] is True
        assert second["is_default_master"] is False

    async def test_atomic_moves_default_when_default_stuck(self, db: Database) -> None:
        first = await db.create_resume_atomic_master(
            content="first", processing_status="failed"
        )
        second = await db.create_resume_atomic_master(
            content="second", processing_status="ready"
        )
        assert second["is_default_master"] is True
        assert (await db.get_master_resume())["resume_id"] == second["resume_id"]
        old = await db.get_resume(first["resume_id"])
        assert old["is_master"] is True and old["is_default_master"] is False

    async def test_atomic_keeps_stuck_default_when_takeover_disabled(
        self, db: Database
    ) -> None:
        first = await db.create_resume_atomic_master(
            content="first", processing_status="failed"
        )
        second = await db.create_resume_atomic_master(
            content="second", processing_status="ready", take_over_stuck_default=False
        )
        assert second["is_default_master"] is False
        assert (await db.get_master_resume())["resume_id"] == first["resume_id"]

    async def test_atomic_rejects_sixth_master(self, db: Database) -> None:
        from app.database import MAX_MASTER_RESUMES, MasterResumeLimitError

        for i in range(MAX_MASTER_RESUMES):
            await db.create_resume_atomic_master(
                content=f"m{i}", processing_status="ready"
            )
        with pytest.raises(MasterResumeLimitError):
            await db.create_resume_atomic_master(
                content="too-many", processing_status="ready"
            )
        assert len(await db.list_master_resumes()) == MAX_MASTER_RESUMES

    async def test_delete_default_promotes_earliest_remaining_master(
        self, db: Database
    ) -> None:
        first = await db.create_resume_atomic_master(
            content="a", processing_status="ready"
        )
        second = await db.create_resume_atomic_master(
            content="b", processing_status="ready"
        )
        third = await db.create_resume_atomic_master(
            content="c", processing_status="ready"
        )
        assert await db.delete_resume(first["resume_id"]) is True
        assert (await db.get_master_resume())["resume_id"] == second["resume_id"]
        assert (await db.get_resume(third["resume_id"]))["is_default_master"] is False

    async def test_delete_last_master_leaves_no_default(self, db: Database) -> None:
        only = await db.create_resume_atomic_master(
            content="a", processing_status="ready"
        )
        await db.delete_resume(only["resume_id"])
        assert await db.get_master_resume() is None

    async def test_list_master_resumes_orders_by_creation(self, db: Database) -> None:
        a = await db.create_resume_atomic_master(content="a", processing_status="ready")
        await db.create_resume(content="child")
        b = await db.create_resume_atomic_master(content="b", processing_status="ready")
        assert [r["resume_id"] for r in await db.list_master_resumes()] == [
            a["resume_id"],
            b["resume_id"],
        ]

    async def test_preview_source_data_round_trips_on_claim(self, db: Database) -> None:
        master = await db.create_resume_atomic_master(
            content="m", processing_status="ready"
        )
        job = await db.create_job(content="jd", resume_id=master["resume_id"])
        from app.preview import job_fingerprint, resume_fingerprint

        registered = await db.register_preview(
            source_id=master["resume_id"],
            job_id=job["job_id"],
            payload_hash="h",
            source_hash=resume_fingerprint(
                master["content"], master.get("processed_data"), None
            ),
            job_hash=job_fingerprint(job["content"]),
            prompt_id="keywords",
            ttl_seconds=60,
            source_data={"summary": "condensed"},
        )
        claim = await db.claim_preview(
            preview_id=registered["preview_id"],
            source_id=master["resume_id"],
            job_id=job["job_id"],
            payload_hash="h",
            lease_seconds=30,
        )
        assert claim.source_data == {"summary": "condensed"}


class TestJobs:
    async def test_create_and_get_job(self, db):
        created = await db.create_job(content="Engineer role", resume_id="r1")
        fetched = await db.get_job(created["job_id"])
        assert fetched["content"] == "Engineer role"
        assert fetched["resume_id"] == "r1"

    async def test_get_missing_job_returns_none(self, db):
        assert await db.get_job("missing") is None

    async def test_update_job(self, db):
        created = await db.create_job(content="old")
        updated = await db.update_job(created["job_id"], {"content": "new"})
        assert updated["content"] == "new"

    async def test_update_missing_job_returns_none(self, db):
        assert await db.update_job("missing", {"content": "x"}) is None

    async def test_dynamic_fields_round_trip_as_top_level(self, db):
        """Dynamic pipeline fields must survive write→read as top-level keys.

        This is the highest-risk migration detail: ``/improve/confirm`` rejects
        with 400 if ``preview_hash``/``preview_hashes`` don't round-trip.
        """
        created = await db.create_job(content="jd")
        await db.update_job(
            created["job_id"],
            {
                "job_keywords": {"required_skills": ["Python", "AWS"]},
                "job_keywords_hash": "deadbeef",
                "preview_hash": "abc123",
                "preview_hashes": {"keywords": "abc123", "nudge": "def456"},
                "preview_prompt_id": "keywords",
                "company": "Acme Corp",
                "role": "Staff Engineer",
            },
        )
        fetched = await db.get_job(created["job_id"])
        # Core fields preserved.
        assert fetched["content"] == "jd"
        # Dynamic fields flattened to the top level.
        assert fetched["preview_hash"] == "abc123"
        assert fetched["preview_hashes"] == {"keywords": "abc123", "nudge": "def456"}
        assert fetched["job_keywords_hash"] == "deadbeef"
        assert fetched["job_keywords"]["required_skills"] == ["Python", "AWS"]
        assert fetched["company"] == "Acme Corp"
        assert fetched["role"] == "Staff Engineer"

    async def test_update_job_merges_metadata(self, db):
        created = await db.create_job(content="jd")
        await db.update_job(created["job_id"], {"preview_hash": "h1"})
        await db.update_job(created["job_id"], {"company": "Acme"})
        fetched = await db.get_job(created["job_id"])
        # The second update must not wipe the first dynamic field.
        assert fetched["preview_hash"] == "h1"
        assert fetched["company"] == "Acme"


class TestImprovements:
    async def test_create_and_lookup_by_tailored_resume(self, db):
        await db.create_improvement(
            original_resume_id="orig",
            tailored_resume_id="tailored-1",
            job_id="job-1",
            improvements=[{"path": "summary"}],
        )
        found = await db.get_improvement_by_tailored_resume("tailored-1")
        assert found is not None
        assert found["job_id"] == "job-1"

    async def test_lookup_missing_returns_none(self, db):
        assert await db.get_improvement_by_tailored_resume("nope") is None


class TestApplications:
    async def test_create_defaults_and_position(self, db):
        a = await db.create_application(job_id="j1", resume_id="r1")
        assert a["status"] == "applied"
        assert a["position"] == 0
        assert a["applied_at"] is not None  # applied → stamped
        b = await db.create_application(job_id="j2", resume_id="r2")
        assert b["position"] == 1  # appended to the column

    async def test_saved_status_has_no_applied_at(self, db):
        a = await db.create_application(job_id="j1", resume_id="r1", status="saved")
        assert a["applied_at"] is None

    async def test_create_dedupes_on_job_and_resume(self, db):
        a = await db.create_application(job_id="j1", resume_id="r1")
        again = await db.create_application(job_id="j1", resume_id="r1")
        assert again["application_id"] == a["application_id"]
        assert len(await db.list_applications()) == 1

    async def test_move_renumbers_columns(self, db):
        a = await db.create_application(job_id="j1", resume_id="r1")
        b = await db.create_application(job_id="j2", resume_id="r2")
        # Move a to the front of "interview".
        moved = await db.update_application(
            a["application_id"], {"status": "interview", "position": 0}
        )
        assert moved["status"] == "interview"
        assert moved["position"] == 0
        # The "applied" column renumbered: b is now position 0.
        applied = await db.list_applications(status="applied")
        assert [x["application_id"] for x in applied] == [b["application_id"]]
        assert applied[0]["position"] == 0

    async def test_bulk_update_and_delete(self, db):
        a = await db.create_application(job_id="j1", resume_id="r1")
        b = await db.create_application(job_id="j2", resume_id="r2")
        moved = await db.bulk_update_applications(
            [a["application_id"], b["application_id"]], "rejected"
        )
        assert moved == 2
        rejected = await db.list_applications(status="rejected")
        assert {x["position"] for x in rejected} == {0, 1}
        deleted = await db.bulk_delete_applications([a["application_id"]])
        assert deleted == 1
        remaining = await db.list_applications(status="rejected")
        assert len(remaining) == 1
        assert remaining[0]["position"] == 0  # renumbered after delete


class TestApiKeyStore:
    async def test_set_get_delete_ciphertext(self, db):
        db.set_api_key_ciphertext("openai", "ct-openai")
        db.set_api_key_ciphertext("anthropic", "ct-anthropic")
        assert db.get_api_key_ciphertexts() == {
            "openai": "ct-openai",
            "anthropic": "ct-anthropic",
        }
        db.delete_api_key("openai")
        assert db.get_api_key_ciphertexts() == {"anthropic": "ct-anthropic"}
        db.clear_api_keys()
        assert db.get_api_key_ciphertexts() == {}


class TestStatsAndReset:
    async def test_get_stats(self, db):
        await db.create_resume_atomic_master(content="a", processing_status="ready")
        await db.create_job(content="jd")
        stats = await db.get_stats()
        assert stats["total_resumes"] == 1
        assert stats["total_jobs"] == 1
        assert stats["has_master_resume"] is True

    async def test_reset_database_truncates(self, db, tmp_path, monkeypatch):
        # reset_database also clears settings.data_dir/uploads — isolate it to tmp.
        monkeypatch.setattr("app.database.settings.data_dir", tmp_path)
        await db.create_resume(content="a")
        await db.create_job(content="jd")
        await db.create_application(job_id="j1", resume_id="r1")
        await db.reset_database()
        stats = await db.get_stats()
        assert stats["total_resumes"] == 0
        assert stats["total_jobs"] == 0
        assert stats["has_master_resume"] is False
        # Applications are cleared too (no orphans after a full reset).
        assert await db.list_applications() == []


class TestDefaultMasterMigration:
    def _legacy_engine(self, tmp_path: Path) -> Engine:
        engine = make_sync_engine(tmp_path / "legacy.db")
        with engine.begin() as conn:
            conn.exec_driver_sql(
                """
                CREATE TABLE resumes (
                    resume_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    content_type TEXT DEFAULT 'md',
                    is_master BOOLEAN DEFAULT 0,
                    created_at TEXT
                )
                """
            )
            conn.exec_driver_sql(
                "CREATE UNIQUE INDEX ux_resumes_single_master ON resumes (is_master) WHERE is_master = 1"
            )
            conn.exec_driver_sql(
                "INSERT INTO resumes (resume_id, content, is_master, created_at) VALUES "
                "('old-master', 'm', 1, '2026-01-01T00:00:00'), ('child', 'c', 0, '2026-01-02T00:00:00')"
            )
        return engine

    def test_default_master_migration_backfills_and_swaps_index(
        self, tmp_path: Path
    ) -> None:
        engine = self._legacy_engine(tmp_path)
        try:
            init_models_sync(engine)
            init_models_sync(engine)  # idempotent
            with engine.begin() as conn:
                names = [
                    c["name"]
                    for c in conn.exec_driver_sql(
                        "PRAGMA table_info(resumes)"
                    ).mappings()
                ]
                indexes = {
                    r["name"]
                    for r in conn.exec_driver_sql(
                        "PRAGMA index_list(resumes)"
                    ).mappings()
                }
                rows = dict(
                    conn.exec_driver_sql(
                        "SELECT resume_id, is_default_master FROM resumes"
                    ).all()
                )
                preview_cols = [
                    c["name"]
                    for c in conn.exec_driver_sql(
                        "PRAGMA table_info(tailoring_previews)"
                    ).mappings()
                ]
            assert names.count("is_default_master") == 1
            assert "ux_resumes_single_master" not in indexes
            assert "ux_resumes_single_default_master" in indexes
            assert rows == {"old-master": 1, "child": 0}
            assert preview_cols.count("source_data") == 1
        finally:
            engine.dispose()

    def test_default_master_migration_allows_second_master_but_not_second_default(
        self, tmp_path: Path
    ) -> None:
        engine = self._legacy_engine(tmp_path)
        try:
            init_models_sync(engine)
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "INSERT INTO resumes (resume_id, content, is_master, is_default_master, created_at) "
                    "VALUES ('track-2', 't', 1, 0, '2026-01-03T00:00:00')"
                )
            with pytest.raises(sqlalchemy.exc.IntegrityError):
                with engine.begin() as conn:
                    conn.exec_driver_sql(
                        "UPDATE resumes SET is_default_master = 1 WHERE resume_id = 'track-2'"
                    )
        finally:
            engine.dispose()
