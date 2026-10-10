"""Existing improvements tables gain the nullable ats_score column."""

from pathlib import Path

from app.db_engine import init_models_sync, make_sync_engine


def test_ats_score_migration_is_idempotent(tmp_path: Path) -> None:
    engine = make_sync_engine(tmp_path / "legacy.db")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                """
                CREATE TABLE improvements (
                    request_id TEXT PRIMARY KEY,
                    original_resume_id TEXT NOT NULL,
                    tailored_resume_id TEXT NOT NULL,
                    job_id TEXT NOT NULL,
                    improvements JSON,
                    created_at TEXT
                )
                """
            )
            connection.exec_driver_sql(
                "INSERT INTO improvements VALUES ('r1', 'm', 't', 'j', '[]', 'now')"
            )

        init_models_sync(engine)
        init_models_sync(engine)

        with engine.begin() as connection:
            names = [
                column["name"]
                for column in connection.exec_driver_sql(
                    "PRAGMA table_info(improvements)"
                ).mappings()
            ]
            existing = connection.exec_driver_sql(
                "SELECT ats_score FROM improvements WHERE request_id = 'r1'"
            ).scalar_one()
        assert names.count("ats_score") == 1
        assert existing is None  # old rows simply have no score yet
    finally:
        engine.dispose()
