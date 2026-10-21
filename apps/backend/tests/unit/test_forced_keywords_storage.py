"""Forced keywords: the additive column and the interview-prep prompt."""

from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.db_engine import init_models_sync, make_sync_engine
from app.services.interview_prep import generate_interview_prep

PREP = {
    "role_fit_analysis": ["fit"],
    "resume_questions": [],
    "project_follow_ups": [],
    "skill_gaps": [],
    "talking_points": ["point"],
}


def test_forced_keywords_column_is_added_once(tmp_path: Path) -> None:
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
                "SELECT forced_keywords FROM improvements WHERE request_id = 'r1'"
            ).scalar_one()
        assert names.count("forced_keywords") == 1
        assert existing is None
    finally:
        engine.dispose()


async def test_interview_prep_leads_with_forced_keywords() -> None:
    llm = AsyncMock(return_value=PREP)
    with patch("app.services.interview_prep.complete_json", llm):
        await generate_interview_prep(
            {"summary": "x"}, "Need Kubernetes", forced_keywords=["Kubernetes", "Helm"]
        )
        await generate_interview_prep({"summary": "x"}, "Need Kubernetes")
    with_keywords = llm.await_args_list[0].kwargs["prompt"]
    without = llm.await_args_list[1].kwargs["prompt"]
    assert "Claimed keywords" in with_keywords and "Kubernetes, Helm" in with_keywords
    assert "Claimed keywords" not in without
