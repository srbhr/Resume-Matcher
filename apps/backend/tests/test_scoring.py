"""Tests for resume scoring feature."""

import pathlib
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.database import Database
from app.schemas.scoring import ScoreRequest, ScoreResult


# ---------------------------------------------------------------------------
# Database layer
# ---------------------------------------------------------------------------


class TestScoresTable(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.db = Database(db_path=pathlib.Path(self.tmp) / "test.json")

    def tearDown(self) -> None:
        self.db.close()

    def test_create_and_get_score(self) -> None:
        result = {
            "score": 82,
            "ai_score": 82,
            "match_reasons": "good",
            "red_flags": {},
            "label": "Good Fit",
            "color": "green",
        }
        doc = self.db.create_score("r1", "j1", result)
        self.assertEqual(doc["resume_id"], "r1")
        self.assertEqual(doc["job_id"], "j1")
        self.assertEqual(doc["score"], 82)
        self.assertIn("score_id", doc)
        self.assertIn("created_at", doc)

    def test_get_score_returns_none_for_miss(self) -> None:
        self.assertIsNone(self.db.get_score("r999", "j999"))

    def test_get_score_cache_hit(self) -> None:
        result = {
            "score": 50,
            "ai_score": 50,
            "match_reasons": "",
            "red_flags": {},
            "label": "Gap",
            "color": "yellow",
        }
        self.db.create_score("r1", "j1", result)
        doc = self.db.get_score("r1", "j1")
        self.assertIsNotNone(doc)
        assert doc is not None
        self.assertEqual(doc["score"], 50)

    def test_get_score_different_pair_is_miss(self) -> None:
        result = {"score": 70, "ai_score": 70, "match_reasons": "",
                  "red_flags": {}, "label": "ok",
                  "color": "yellow"}
        self.db.create_score("r1", "j1", result)
        self.assertIsNone(self.db.get_score("r1", "j2"))
        self.assertIsNone(self.db.get_score("r2", "j1"))

    def test_delete_score_removes_record(self) -> None:
        result = {"score": 60, "ai_score": 60, "match_reasons": "",
                  "red_flags": {}, "label": "ok",
                  "color": "yellow"}
        self.db.create_score("r1", "j1", result)
        self.assertTrue(self.db.delete_score("r1", "j1"))
        self.assertIsNone(self.db.get_score("r1", "j1"))

    def test_delete_score_returns_false_on_miss(self) -> None:
        self.assertFalse(self.db.delete_score("r999", "j999"))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class TestScoringSchemas(unittest.TestCase):
    def test_score_request_valid(self) -> None:
        req = ScoreRequest(resume_id="r1", job_id="j1")
        self.assertEqual(req.resume_id, "r1")
        self.assertEqual(req.job_id, "j1")

    def test_score_result_fields(self) -> None:
        r = ScoreResult(
            score_id="s1",
            resume_id="r1",
            job_id="j1",
            score=75,
            ai_score=75,
            match_reasons="ok",
            red_flags={},
            label="Fair",
            color="green",
            cached=False,
            created_at="2026-01-01T00:00:00+00:00",
        )
        self.assertEqual(r.score, 75)
        self.assertFalse(r.cached)

    def test_score_result_cached_flag(self) -> None:
        r = ScoreResult(
            score_id="s2",
            resume_id="r1",
            job_id="j1",
            score=60,
            ai_score=60,
            match_reasons="",
            red_flags={},
            label="ok",
            color="yellow",
            cached=True,
            created_at="2026-01-01T00:00:00+00:00",
        )
        self.assertTrue(r.cached)


# ---------------------------------------------------------------------------
# Scoring service — pure helpers
# ---------------------------------------------------------------------------


class TestGetScoreDetails(unittest.TestCase):
    def test_perfect_score(self) -> None:
        from app.services.scorer import get_score_details
        color, label = get_score_details(100)
        self.assertEqual(label, "Legendary Unicorn")

    def test_zero_score(self) -> None:
        from app.services.scorer import get_score_details
        color, label = get_score_details(0)
        self.assertEqual(color, "black")

    def test_low_score(self) -> None:
        from app.services.scorer import get_score_details
        color, label = get_score_details(3)
        self.assertEqual(color, "black")

    def test_boundary_82(self) -> None:
        from app.services.scorer import get_score_details
        _, label = get_score_details(82)
        self.assertEqual(label, "Suitable Match")

    def test_mid_range(self) -> None:
        from app.services.scorer import get_score_details
        color, _ = get_score_details(85)
        self.assertEqual(color, "green")

    def test_score_clamped_above_100_returns_legendary(self) -> None:
        from app.services.scorer import get_score_details
        _, label = get_score_details(100)
        self.assertEqual(label, "Legendary Unicorn")


# ---------------------------------------------------------------------------
# Scoring service — async LLM calls
# ---------------------------------------------------------------------------


class TestExtractJobRequirements(unittest.IsolatedAsyncioTestCase):
    async def test_returns_parsed_dict(self) -> None:
        from app.services import scorer as scorer_module
        mock_result = {
            "required_skills": ["Python"],
            "emphasis": {"technical_skills_weight": 50},
        }
        with patch.object(scorer_module, "complete_json", AsyncMock(return_value=mock_result)):
            result = await scorer_module.extract_job_requirements("Job desc text")
        if result is None:
            self.fail("Expected parsed job requirements, got None")
        self.assertEqual(result["required_skills"], ["Python"])

    async def test_returns_none_on_llm_failure(self) -> None:
        from app.services import scorer as scorer_module
        with patch.object(scorer_module, "complete_json", AsyncMock(side_effect=ValueError("boom"))):
            result = await scorer_module.extract_job_requirements("Job desc text")
        self.assertIsNone(result)

    async def test_returns_none_when_emphasis_missing(self) -> None:
        from app.services import scorer as scorer_module
        with patch.object(scorer_module, "complete_json", AsyncMock(return_value={"required_skills": []})):
            result = await scorer_module.extract_job_requirements("Job desc text")
        self.assertIsNone(result)


# ---------------------------------------------------------------------------
# Scoring service — score_resume integration
# ---------------------------------------------------------------------------


class TestScoreResume(unittest.IsolatedAsyncioTestCase):
    async def test_returns_cached_score_without_llm(self) -> None:
        from app.services import scorer as scorer_module
        cached = {
            "score_id": "s1",
            "resume_id": "r1",
            "job_id": "j1",
            "score": 77,
            "ai_score": 77,
            "match_reasons": "good",
            "red_flags": {},
            "label": "ok",
            "color": "green",
            "cached": True,
            "created_at": "2026-01-01T00:00:00+00:00",
        }
        mock_db = MagicMock()
        mock_db.get_score.return_value = cached
        with patch.object(scorer_module, "db", mock_db):
            result = await scorer_module.score_resume("r1", "j1")
        self.assertEqual(result["score"], 77)
        self.assertTrue(result["cached"])
        mock_db.get_score.assert_called_once_with("r1", "j1")

    async def test_raises_404_for_missing_resume(self) -> None:
        from app.services import scorer as scorer_module
        mock_db = MagicMock()
        mock_db.get_score.return_value = None
        mock_db.get_resume.return_value = None
        with patch.object(scorer_module, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await scorer_module.score_resume("bad_id", "j1")
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_raises_404_for_missing_job(self) -> None:
        from app.services import scorer as scorer_module
        mock_db = MagicMock()
        mock_db.get_score.return_value = None
        mock_db.get_resume.return_value = {"processed_data": {"personalInfo": {}}}
        mock_db.get_job.return_value = None
        with patch.object(scorer_module, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await scorer_module.score_resume("r1", "bad_job")
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_raises_400_when_resume_has_no_processed_data(self) -> None:
        from app.services import scorer as scorer_module
        mock_db = MagicMock()
        mock_db.get_score.return_value = None
        mock_db.get_resume.return_value = {"processed_data": None}
        mock_db.get_job.return_value = {"content": "We need Python dev"}
        with patch.object(scorer_module, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await scorer_module.score_resume("r1", "j1")
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_full_score_path_saves_to_db(self) -> None:
        from app.services import scorer as scorer_module
        mock_db = MagicMock()
        mock_db.get_score.return_value = None
        mock_db.get_resume.return_value = {"processed_data": {"personalInfo": {"name": "Test"}}}
        mock_db.get_job.return_value = {"content": "Python dev job"}
        saved_doc = {
            "score_id": "s1", "resume_id": "r1", "job_id": "j1",
            "score": 80, "ai_score": 80, "match_reasons": "good",
            "red_flags": {}, "label": "Good",
            "color": "green", "created_at": "2026-01-01T00:00:00+00:00",
        }
        mock_db.create_score.return_value = saved_doc

        ai_result = {
            "score": 80, "match_reasons": "good | fit",
            "red_flags": {"critical": [], "major": [], "minor": []},
        }
        with (
            patch.object(scorer_module, "db", mock_db),
            patch.object(scorer_module, "_compute_ai_match", AsyncMock(return_value=ai_result)),
        ):
            result = await scorer_module.score_resume("r1", "j1")

        mock_db.create_score.assert_called_once()
        self.assertEqual(result["score"], 80)
        self.assertFalse(result.get("cached", False))


# ---------------------------------------------------------------------------
# Scoring router
# ---------------------------------------------------------------------------


class TestScoringRouter(unittest.IsolatedAsyncioTestCase):
    async def test_post_scores_returns_result(self) -> None:
        from app.routers import scoring as scoring_router
        score_data = {
            "score_id": "s1",
            "resume_id": "r1",
            "job_id": "j1",
            "score": 80,
            "ai_score": 80,
            "match_reasons": "good",
            "red_flags": {},
            "label": "Good",
            "color": "green",
            "cached": False,
            "created_at": "2026-01-01T00:00:00+00:00",
        }
        with patch.object(scoring_router, "score_resume", AsyncMock(return_value=score_data)):
            result = await scoring_router.create_score(ScoreRequest(resume_id="r1", job_id="j1"))
        self.assertEqual(result.score, 80)
        self.assertFalse(result.cached)

    async def test_get_score_returns_cached(self) -> None:
        from app.routers import scoring as scoring_router
        cached = {
            "score_id": "s1",
            "resume_id": "r1",
            "job_id": "j1",
            "score": 80,
            "ai_score": 80,
            "match_reasons": "good",
            "red_flags": {},
            "label": "Good",
            "color": "green",
            "cached": True,
            "created_at": "2026-01-01T00:00:00+00:00",
        }
        mock_db = MagicMock()
        mock_db.get_score.return_value = cached
        with patch.object(scoring_router, "db", mock_db):
            result = await scoring_router.get_score("r1", "j1")
        self.assertEqual(result.score, 80)
        self.assertTrue(result.cached)

    async def test_get_score_raises_404_on_miss(self) -> None:
        from app.routers import scoring as scoring_router
        mock_db = MagicMock()
        mock_db.get_score.return_value = None
        with patch.object(scoring_router, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await scoring_router.get_score("r1", "j1")
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_delete_score_success(self) -> None:
        from app.routers import scoring as scoring_router
        mock_db = MagicMock()
        mock_db.delete_score.return_value = True
        with patch.object(scoring_router, "db", mock_db):
            result = await scoring_router.delete_score("r1", "j1")
        self.assertIsNone(result)
        mock_db.delete_score.assert_called_once_with("r1", "j1")

    async def test_delete_score_raises_404_on_miss(self) -> None:
        from app.routers import scoring as scoring_router
        mock_db = MagicMock()
        mock_db.delete_score.return_value = False
        with patch.object(scoring_router, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await scoring_router.delete_score("r1", "j1")
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
