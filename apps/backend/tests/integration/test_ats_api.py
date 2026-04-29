"""Integration tests for POST /api/v1/ats/screen."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


SAMPLE_RESUME = {
    "personalInfo": {"name": "Jane Doe", "title": "Product Manager", "email": "jane@example.com",
                     "phone": "", "location": "SF, CA"},
    "summary": "PM with 5 years experience driving product roadmaps.",
    "workExperience": [
        {"id": 1, "title": "Product Manager", "company": "Acme", "location": "SF",
         "years": "2020 - Present",
         "description": ["Led roadmap for core product", "Worked with engineering teams"]}
    ],
    "education": [{"id": 1, "institution": "UC Berkeley", "degree": "B.S. Business", "years": "2016 - 2020"}],
    "personalProjects": [],
    "additional": {"technicalSkills": ["Jira", "Figma"], "languages": [], "certificationsTraining": [], "awards": []},
    "customSections": {},
    "sectionMeta": [],
}

PASS1_RESULT = {
    "score": {"skills_match": 25, "experience_match": 22, "domain_match": 18,
              "tools_match": 12, "achievement_match": 5, "total": 82},
    "decision": "PASS",
    "keyword_table": [{"keyword": "roadmap", "found_in_resume": True, "section": "workExperience"}],
    "missing_keywords": ["A/B testing"],
    "warning_flags": ["Missing quantified achievements"],
}

PASS2_RESULT = {
    "optimized_resume": SAMPLE_RESUME,
    "optimization_suggestions": ["Add metrics to bullet points"],
}


class TestATSScreen:
    """POST /api/v1/ats/screen"""

    @patch("app.routers.ats.db")
    @patch("app.routers.ats.run_pass2", new_callable=AsyncMock)
    @patch("app.routers.ats.run_pass1", new_callable=AsyncMock)
    async def test_screen_with_resume_id_and_job_id(
        self, mock_pass1, mock_pass2, mock_db, client
    ):
        mock_db.get_resume.return_value = {
            "resume_id": "r1",
            "content": "Product manager resume with 5 years...",
            "processed_data": SAMPLE_RESUME,
        }
        mock_db.get_job.return_value = {"job_id": "j1", "content": "PM role at startup..."}

        from app.schemas.ats import ScoreBreakdown, KeywordRow
        mock_pass1.return_value = {
            "score": ScoreBreakdown(skills_match=25, experience_match=22, domain_match=18,
                                    tools_match=12, achievement_match=5, total=82),
            "decision": "PASS",
            "keyword_table": [KeywordRow(keyword="roadmap", found_in_resume=True, section="workExperience")],
            "missing_keywords": ["A/B testing"],
            "warning_flags": ["Missing quantified achievements"],
        }
        from app.schemas.models import ResumeData
        mock_pass2.return_value = {
            "optimized_resume": ResumeData.model_validate(SAMPLE_RESUME),
            "optimization_suggestions": ["Add metrics"],
        }

        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_id": "r1",
                "job_id": "j1",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["decision"] == "PASS"
        assert data["score"]["total"] == 82
        assert len(data["keyword_table"]) == 1
        assert data["optimized_resume"] is not None

    @patch("app.routers.ats.run_pass2", new_callable=AsyncMock)
    @patch("app.routers.ats.run_pass1", new_callable=AsyncMock)
    async def test_screen_with_raw_text(self, mock_pass1, mock_pass2, client):
        from app.schemas.ats import ScoreBreakdown
        from app.schemas.models import ResumeData
        mock_pass1.return_value = {
            "score": ScoreBreakdown(skills_match=15, experience_match=10, domain_match=10,
                                    tools_match=5, achievement_match=3, total=43),
            "decision": "REJECT",
            "keyword_table": [],
            "missing_keywords": ["Python", "Agile"],
            "warning_flags": [f"flag{i}" for i in range(10)],
        }
        mock_pass2.return_value = {
            "optimized_resume": ResumeData.model_validate(SAMPLE_RESUME),
            "optimization_suggestions": [],
        }

        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_text": "I am a product manager " * 20,
                "job_description": "We are looking for a senior PM " * 10,
            })

        assert resp.status_code == 200
        assert resp.json()["decision"] == "REJECT"

    async def test_missing_both_resume_inputs_returns_422(self, client):
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "job_description": "Some JD text",
            })
        assert resp.status_code == 422

    async def test_missing_both_job_inputs_returns_422(self, client):
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_text": "Some resume text " * 10,
            })
        assert resp.status_code == 422

    @patch("app.routers.ats.db")
    async def test_resume_id_not_found_returns_404(self, mock_db, client):
        mock_db.get_resume.return_value = None
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_id": "nonexistent",
                "job_description": "Some JD text",
            })
        assert resp.status_code == 404

    @patch("app.routers.ats.db")
    async def test_job_id_not_found_returns_404(self, mock_db, client):
        mock_db.get_resume.return_value = {
            "resume_id": "r1",
            "content": "x" * 200,
            "processed_data": SAMPLE_RESUME,
        }
        mock_db.get_job.return_value = None
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_id": "r1",
                "job_id": "nonexistent",
            })
        assert resp.status_code == 404

    @patch("app.routers.ats.run_pass2", new_callable=AsyncMock)
    @patch("app.routers.ats.run_pass1", new_callable=AsyncMock)
    async def test_short_resume_text_returns_400(self, mock_pass1, mock_pass2, client):
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_text": "short",
                "job_description": "Senior PM role",
            })
        assert resp.status_code == 400

    @patch("app.routers.ats.db")
    @patch("app.routers.ats.run_pass2", new_callable=AsyncMock)
    @patch("app.routers.ats.run_pass1", new_callable=AsyncMock)
    async def test_save_optimized_creates_new_resume(
        self, mock_pass1, mock_pass2, mock_db, client
    ):
        mock_db.get_resume.return_value = {
            "resume_id": "r1",
            "content": "Product manager resume " * 20,
            "processed_data": SAMPLE_RESUME,
        }
        mock_db.get_job.return_value = {"job_id": "j1", "content": "PM role " * 20}
        mock_db.create_resume.return_value = {"resume_id": "new-r1"}

        from app.schemas.ats import ScoreBreakdown
        from app.schemas.models import ResumeData
        mock_pass1.return_value = {
            "score": ScoreBreakdown(skills_match=25, experience_match=22, domain_match=18,
                                    tools_match=12, achievement_match=5, total=82),
            "decision": "PASS",
            "keyword_table": [],
            "missing_keywords": [],
            "warning_flags": [],
        }
        mock_pass2.return_value = {
            "optimized_resume": ResumeData.model_validate(SAMPLE_RESUME),
            "optimization_suggestions": [],
        }

        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_id": "r1",
                "job_id": "j1",
                "save_optimized": True,
            })

        assert resp.status_code == 200
        assert resp.json()["saved_resume_id"] == "new-r1"
        mock_db.create_resume.assert_called_once()
