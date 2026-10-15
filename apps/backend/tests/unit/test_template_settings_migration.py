"""Existing resumes tables gain the nullable template_settings column."""

from pathlib import Path

from app.db_engine import init_models_sync, make_sync_engine


def test_template_settings_migration_is_idempotent(tmp_path: Path) -> None:
    engine = make_sync_engine(tmp_path / "legacy.db")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                """
                CREATE TABLE resumes (
                    resume_id TEXT PRIMARY KEY,
                    content TEXT,
                    content_type TEXT,
                    filename TEXT,
                    is_master BOOLEAN,
                    parent_id TEXT,
                    processed_data JSON,
                    processing_status TEXT,
                    cover_letter TEXT,
                    outreach_message TEXT,
                    title TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
                """
            )
            connection.exec_driver_sql(
                "INSERT INTO resumes (resume_id, content, is_master) VALUES ('r1', 'cv', 1)"
            )

        init_models_sync(engine)
        init_models_sync(engine)

        with engine.begin() as connection:
            names = [
                column["name"]
                for column in connection.exec_driver_sql(
                    "PRAGMA table_info(resumes)"
                ).mappings()
            ]
            existing = connection.exec_driver_sql(
                "SELECT template_settings FROM resumes WHERE resume_id = 'r1'"
            ).scalar_one()
        assert names.count("template_settings") == 1
        assert existing is None  # old resumes show the default template
    finally:
        engine.dispose()
