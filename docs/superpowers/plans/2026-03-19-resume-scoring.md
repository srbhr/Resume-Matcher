# Resume Scoring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cached resume-vs-job scoring endpoint (`POST /api/v1/scores`) that ports `scorer.py` logic to use Resume Matcher's LiteLLM wrapper and TinyDB.

**Architecture:** Scoring logic lives in `app/services/scorer.py` (pure async functions). The router in `app/routers/scoring.py` checks the cache before calling the service. Results are stored in a new TinyDB `scores` table added to `database.py`. PDF parsing and visual quality scoring are dropped — resumes are already structured JSON in the DB.

**Tech Stack:** FastAPI, Pydantic v2, TinyDB, LiteLLM (`app.llm.complete` / `complete_json`), asyncio, unittest + IsolatedAsyncioTestCase

---

## Chunk 1: Database + Schemas

### Task 1: Add `scores` table to Database

**Files:**
- Modify: `apps/backend/app/database.py`
- Test: `apps/backend/tests/test_scoring.py`

- [x] **Step 1: Write failing test**

```python
# tests/test_scoring.py
import unittest
from app.database import Database

class TestScoresTable(unittest.TestCase):
    def setUp(self):
        import tempfile, pathlib
        self.tmp = tempfile.mkdtemp()
        self.db = Database(db_path=pathlib.Path(self.tmp) / "test.json")

    def tearDown(self):
        self.db.close()

    def test_create_and_get_score(self):
        result = {"score": 82, "ai_score": 82, "match_reasons": "good",
                  "red_flags": {}, "website": "", "label": "Good Fit",
                  "emoji": "🌿", "color": "green"}
        doc = self.db.create_score("r1", "j1", result)
        self.assertEqual(doc["resume_id"], "r1")
        self.assertEqual(doc["job_id"], "j1")
        self.assertEqual(doc["score"], 82)
        self.assertIn("score_id", doc)

    def test_get_score_returns_none_for_miss(self):
        self.assertIsNone(self.db.get_score("r999", "j999"))

    def test_get_score_cache_hit(self):
        result = {"score": 50, "ai_score": 50, "match_reasons": "",
                  "red_flags": {}, "website": "", "label": "Gap",
                  "emoji": "🐤", "color": "yellow"}
        self.db.create_score("r1", "j1", result)
        doc = self.db.get_score("r1", "j1")
        self.assertIsNotNone(doc)
        self.assertEqual(doc["score"], 50)
```

- [x] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && python -m pytest tests/test_scoring.py::TestScoresTable -v 2>&1 | head -20
```

- [x] **Step 3: Implement**

Add to `app/database.py`:
- `scores` property returning `db.table("scores")`
- `create_score(resume_id, job_id, result)` — inserts with uuid `score_id` + `created_at`
- `get_score(resume_id, job_id)` — queries by both fields, returns first or None

- [x] **Step 4: Run test to verify pass**
- [x] **Step 5: Commit** `feat: add scores table to TinyDB database`

---

### Task 2: Pydantic schemas

**Files:**
- Create: `apps/backend/app/schemas/scoring.py`
- Modify: `apps/backend/app/schemas/__init__.py`
- Test: `apps/backend/tests/test_scoring.py`

- [x] **Step 1: Write failing test** (add to `test_scoring.py`)

```python
from app.schemas.scoring import ScoreRequest, ScoreResult

class TestScoringSchemas(unittest.TestCase):
    def test_score_request_valid(self):
        req = ScoreRequest(resume_id="r1", job_id="j1")
        self.assertEqual(req.resume_id, "r1")

    def test_score_result_fields(self):
        r = ScoreResult(score_id="s1", resume_id="r1", job_id="j1",
                        score=75, ai_score=75, match_reasons="ok",
                        red_flags={}, website="", label="Fair",
                        emoji="🥝", color="green", cached=False,
                        created_at="2026-01-01T00:00:00+00:00")
        self.assertEqual(r.score, 75)
        self.assertFalse(r.cached)
```

- [x] **Step 2–4: Implement and verify**
- [x] **Step 5: Commit** `feat: add scoring Pydantic schemas`

---

## Chunk 2: Scoring Service

### Task 3: Scoring service (`app/services/scorer.py`)

**Files:**
- Create: `apps/backend/app/services/scorer.py`
- Test: `apps/backend/tests/test_scoring.py`

Key functions ported from `scorer.py`, adapted for async LiteLLM:

| Original | Adapted |
|----------|---------|
| `extract_job_requirements` | `async extract_job_requirements(job_desc)` → `complete_json` |
| `_compute_ai_match` | `async _compute_ai_match(resume_text, job_desc)` — parallel `asyncio.gather` on 7 criteria + reasons + website using `complete` |
| `get_score_details` | `get_score_details` — pure, copied as-is |
| `score_resume(path)` | `async score_resume(resume_id, job_id)` — loads from DB, calls above, returns dict |

**Logging rules:**
- Do NOT log resume text, job description text, candidate name, contact info
- Do NOT log score_id or resume_id in error traces
- Log only: criteria name, LLM error type, attempt counts

- [x] **Step 1: Write failing tests**

```python
from unittest.mock import AsyncMock, patch, MagicMock
import unittest

class TestGetScoreDetails(unittest.TestCase):
    def test_perfect_score(self):
        from app.services.scorer import get_score_details
        emoji, color, label = get_score_details(100)
        self.assertEqual(label, "Legendary Unicorn")

    def test_low_score(self):
        from app.services.scorer import get_score_details
        emoji, color, label = get_score_details(3)
        self.assertEqual(color, "black")

    def test_boundary_82(self):
        from app.services.scorer import get_score_details
        _, _, label = get_score_details(82)
        self.assertEqual(label, "Suitable Match")


class TestExtractJobRequirements(unittest.IsolatedAsyncioTestCase):
    async def test_returns_parsed_dict(self):
        from app.services import scorer as scorer_module
        mock_result = {"required_skills": ["Python"], "emphasis": {"technical_skills_weight": 50}}
        with patch.object(scorer_module, "complete_json", AsyncMock(return_value=mock_result)):
            result = await scorer_module.extract_job_requirements("Job desc text")
        self.assertEqual(result["required_skills"], ["Python"])

    async def test_returns_none_on_llm_failure(self):
        from app.services import scorer as scorer_module
        with patch.object(scorer_module, "complete_json", AsyncMock(side_effect=ValueError("boom"))):
            result = await scorer_module.extract_job_requirements("Job desc text")
        self.assertIsNone(result)


class TestScoreResume(unittest.IsolatedAsyncioTestCase):
    async def test_returns_cached_score_without_llm(self):
        from app.services import scorer as scorer_module
        cached = {"score": 77, "ai_score": 77, "match_reasons": "good",
                  "red_flags": {}, "website": "", "label": "ok",
                  "emoji": "x", "color": "green", "cached": True,
                  "score_id": "s1", "resume_id": "r1", "job_id": "j1",
                  "created_at": "2026-01-01T00:00:00+00:00"}
        mock_db = MagicMock()
        mock_db.get_score.return_value = cached
        with patch.object(scorer_module, "db", mock_db):
            result = await scorer_module.score_resume("r1", "j1")
        self.assertEqual(result["score"], 77)
        self.assertTrue(result["cached"])
        mock_db.get_score.assert_called_once_with("r1", "j1")

    async def test_raises_404_for_missing_resume(self):
        from app.services import scorer as scorer_module
        from fastapi import HTTPException
        mock_db = MagicMock()
        mock_db.get_score.return_value = None
        mock_db.get_resume.return_value = None
        with patch.object(scorer_module, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await scorer_module.score_resume("bad_id", "j1")
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_raises_404_for_missing_job(self):
        from app.services import scorer as scorer_module
        from fastapi import HTTPException
        mock_db = MagicMock()
        mock_db.get_score.return_value = None
        mock_db.get_resume.return_value = {"processed_data": {"personalInfo": {}}}
        mock_db.get_job.return_value = None
        with patch.object(scorer_module, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await scorer_module.score_resume("r1", "bad_job")
        self.assertEqual(ctx.exception.status_code, 404)
```

- [x] **Step 2–4: Implement and verify**
- [x] **Step 5: Commit** `feat: add scoring service with LiteLLM integration`

---

## Chunk 3: Router + Wiring

### Task 4: Scoring router

**Files:**
- Create: `apps/backend/app/routers/scoring.py`
- Test: `apps/backend/tests/test_scoring.py`

Endpoints:
- `POST /scores` — body: `ScoreRequest`; calls `score_resume`; returns `ScoreResult`
- `GET /scores/{resume_id}/{job_id}` — checks cache; returns `ScoreResult` or 404

```python
class TestScoringRouter(unittest.IsolatedAsyncioTestCase):
    async def test_post_scores_returns_result(self):
        from app.routers import scoring as scoring_router
        from app.schemas.scoring import ScoreRequest
        score_data = {"score_id": "s1", "resume_id": "r1", "job_id": "j1",
                      "score": 80, "ai_score": 80, "match_reasons": "good",
                      "red_flags": {}, "website": "", "label": "Good",
                      "emoji": "🍀", "color": "green", "cached": False,
                      "created_at": "2026-01-01T00:00:00+00:00"}
        with patch.object(scoring_router, "score_resume", AsyncMock(return_value=score_data)):
            result = await scoring_router.create_score(ScoreRequest(resume_id="r1", job_id="j1"))
        self.assertEqual(result.score, 80)

    async def test_get_score_returns_cached(self):
        from app.routers import scoring as scoring_router
        cached = {"score_id": "s1", "resume_id": "r1", "job_id": "j1",
                  "score": 80, "ai_score": 80, "match_reasons": "good",
                  "red_flags": {}, "website": "", "label": "Good",
                  "emoji": "🍀", "color": "green", "cached": True,
                  "created_at": "2026-01-01T00:00:00+00:00"}
        mock_db = MagicMock()
        mock_db.get_score.return_value = cached
        with patch.object(scoring_router, "db", mock_db):
            result = await scoring_router.get_score("r1", "j1")
        self.assertEqual(result.score, 80)
        self.assertTrue(result.cached)

    async def test_get_score_raises_404_on_miss(self):
        from app.routers import scoring as scoring_router
        from fastapi import HTTPException
        mock_db = MagicMock()
        mock_db.get_score.return_value = None
        with patch.object(scoring_router, "db", mock_db):
            with self.assertRaises(HTTPException) as ctx:
                await scoring_router.get_score("r1", "j1")
        self.assertEqual(ctx.exception.status_code, 404)
```

- [x] **Step 2–4: Implement and verify**
- [x] **Step 5: Commit** `feat: add scoring API router`

---

### Task 5: Wire up router in `__init__` and `main.py`

**Files:**
- Modify: `apps/backend/app/routers/__init__.py`
- Modify: `apps/backend/app/main.py`

- [x] **Step 1:** Add `from app.routers.scoring import router as scoring_router` to `__init__.py`; export in `__all__`
- [x] **Step 2:** Add `app.include_router(scoring_router, prefix="/api/v1")` in `main.py`
- [x] **Step 3:** Run full test suite: `cd apps/backend && python -m pytest tests/ -v`
- [x] **Step 4: Commit** `feat: register scoring router in FastAPI app`
