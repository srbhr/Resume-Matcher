"""Integration tests for resume CRUD endpoints."""

import json
from unittest.mock import patch, AsyncMock, MagicMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas import InterviewPrepData


SAMPLE_INTERVIEW_PREP = {
    "role_fit_analysis": ["Backend API experience maps to the role."],
    "resume_questions": [
        {
            "question": "How did you design the FastAPI service on your resume?",
            "focus_area": "Backend architecture",
            "suggested_answer_points": ["Discuss the documented API work only."],
        }
    ],
    "project_follow_ups": [
        {
            "question": "What tradeoffs did you make in the resume matcher project?",
            "focus_area": "Project implementation",
            "suggested_answer_points": ["Explain real project choices from the resume."],
        }
    ],
    "skill_gaps": [
        {
            "skill": "Kubernetes",
            "why_it_matters": "The job description mentions production deployment.",
            "preparation_suggestion": "Review core concepts without claiming production use.",
        }
    ],
    "talking_points": ["Connect API work to the job's backend requirements."],
}


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
def mock_resume_record(sample_resume):
    """A resume DB record with all fields."""
    return {
        "resume_id": "res-123",
        "content": "# Jane Doe\nSenior Backend Engineer",
        "content_type": "md",
        "filename": "resume.pdf",
        "is_master": True,
        "parent_id": None,
        "processed_data": sample_resume,
        "processing_status": "ready",
        "cover_letter": None,
        "outreach_message": None,
        "interview_prep": None,
        "title": None,
        "original_markdown": "# Jane Doe\nSenior Backend Engineer",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }


class TestGetResume:
    """GET /api/v1/resumes?resume_id=..."""

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_fetch_existing_resume(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = mock_resume_record
        async with client:
            resp = await client.get("/api/v1/resumes", params={"resume_id": "res-123"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["resume_id"] == "res-123"
        assert data["processed_resume"] is not None
        assert data["processed_resume"]["summary"] != ""
        assert data["interview_prep"] is None

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_invalid_interview_prep_does_not_break_fetch(
        self, mock_db, client, mock_resume_record
    ):
        mock_db.get_resume.return_value = {
            **mock_resume_record,
            "interview_prep": "{not-json",
        }
        async with client:
            resp = await client.get("/api/v1/resumes", params={"resume_id": "res-123"})
        assert resp.status_code == 200
        assert resp.json()["data"]["interview_prep"] is None

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_fetch_nonexistent_returns_404(self, mock_db, client):
        mock_db.get_resume.return_value = None
        async with client:
            resp = await client.get("/api/v1/resumes", params={"resume_id": "nonexistent"})
        assert resp.status_code == 404


class TestListResumes:
    """GET /api/v1/resumes/list"""

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_list_excludes_master_by_default(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {"resume_id": "master", "is_master": True, "created_at": "2026-01-01", "updated_at": "2026-01-01"},
            {"resume_id": "tailored-1", "is_master": False, "created_at": "2026-01-02", "updated_at": "2026-01-02"},
        ]
        async with client:
            resp = await client.get("/api/v1/resumes/list")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 1
        assert data[0]["resume_id"] == "tailored-1"

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_list_includes_master_when_requested(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {"resume_id": "master", "is_master": True, "created_at": "2026-01-01", "updated_at": "2026-01-01"},
            {"resume_id": "tailored-1", "is_master": False, "created_at": "2026-01-02", "updated_at": "2026-01-02"},
        ]
        async with client:
            resp = await client.get("/api/v1/resumes/list", params={"include_master": True})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 2


class TestDeleteResume:
    """DELETE /api/v1/resumes/{resume_id}"""

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_delete_existing_resume(self, mock_db, client):
        mock_db.delete_resume.return_value = True
        async with client:
            resp = await client.delete("/api/v1/resumes/res-123")
        assert resp.status_code == 200

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_delete_nonexistent_returns_404(self, mock_db, client):
        mock_db.delete_resume.return_value = False
        async with client:
            resp = await client.delete("/api/v1/resumes/nonexistent")
        assert resp.status_code == 404


class TestUpdateTitle:
    """PATCH /api/v1/resumes/{resume_id}/title"""

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_update_title(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = mock_resume_record
        mock_db.update_resume.return_value = {**mock_resume_record, "title": "New Title"}
        async with client:
            resp = await client.patch("/api/v1/resumes/res-123/title", json={"title": "New Title"})
        assert resp.status_code == 200

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_update_title_nonexistent_returns_404(self, mock_db, client):
        mock_db.get_resume.return_value = None
        async with client:
            resp = await client.patch("/api/v1/resumes/nonexistent/title", json={"title": "X"})
        assert resp.status_code == 404


class TestUpdateCoverLetter:
    """PATCH /api/v1/resumes/{resume_id}/cover-letter"""

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_update_cover_letter(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = mock_resume_record
        mock_db.update_resume.return_value = {**mock_resume_record, "cover_letter": "Dear hiring manager..."}
        async with client:
            resp = await client.patch("/api/v1/resumes/res-123/cover-letter", json={"content": "Dear hiring manager..."})
        assert resp.status_code == 200


class TestUpdateOutreachMessage:
    """PATCH /api/v1/resumes/{resume_id}/outreach-message"""

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_update_outreach(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = mock_resume_record
        mock_db.update_resume.return_value = {**mock_resume_record, "outreach_message": "Hi, I saw your posting..."}
        async with client:
            resp = await client.patch("/api/v1/resumes/res-123/outreach-message", json={"content": "Hi, I saw your posting..."})
        assert resp.status_code == 200


class TestGenerateInterviewPrep:
    """POST /api/v1/resumes/{resume_id}/generate-interview-prep"""

    @patch("app.routers.resumes.get_content_language", return_value="en")
    @patch("app.routers.resumes.generate_interview_prep", new_callable=AsyncMock)
    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_success_saves_structured_json(
        self, mock_db, mock_generate, _mock_language, client, mock_resume_record, sample_resume
    ):
        tailored = {
            **mock_resume_record,
            "parent_id": "master-1",
            "processed_data": sample_resume,
        }
        mock_db.get_resume.return_value = tailored
        mock_db.get_improvement_by_tailored_resume.return_value = {"job_id": "job-1"}
        mock_db.get_job.return_value = {"job_id": "job-1", "content": "Need FastAPI"}
        mock_generate.return_value = InterviewPrepData.model_validate(SAMPLE_INTERVIEW_PREP)

        async with client:
            resp = await client.post("/api/v1/resumes/res-123/generate-interview-prep")

        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "Interview preparation generated successfully"
        assert data["interview_prep"]["role_fit_analysis"] == SAMPLE_INTERVIEW_PREP[
            "role_fit_analysis"
        ]
        mock_generate.assert_awaited_once_with(sample_resume, "Need FastAPI", "en")
        update_payload = mock_db.update_resume.await_args.args[1]
        saved_payload = json.loads(update_payload["interview_prep"])
        assert saved_payload == SAMPLE_INTERVIEW_PREP

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_rejects_non_tailored_resume(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = mock_resume_record

        async with client:
            resp = await client.post("/api/v1/resumes/res-123/generate-interview-prep")

        assert resp.status_code == 400
        assert "tailored resumes" in resp.json()["detail"]

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_rejects_missing_improvement_context(
        self, mock_db, client, mock_resume_record
    ):
        mock_db.get_resume.return_value = {**mock_resume_record, "parent_id": "master-1"}
        mock_db.get_improvement_by_tailored_resume.return_value = None

        async with client:
            resp = await client.post("/api/v1/resumes/res-123/generate-interview-prep")

        assert resp.status_code == 400
        assert "No job context" in resp.json()["detail"]

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_rejects_missing_processed_data(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = {
            **mock_resume_record,
            "parent_id": "master-1",
            "processed_data": None,
        }
        mock_db.get_improvement_by_tailored_resume.return_value = {"job_id": "job-1"}
        mock_db.get_job.return_value = {"job_id": "job-1", "content": "Need FastAPI"}

        async with client:
            resp = await client.post("/api/v1/resumes/res-123/generate-interview-prep")

        assert resp.status_code == 400
        assert "processed data" in resp.json()["detail"]

    @patch("app.routers.resumes.generate_interview_prep", new_callable=AsyncMock)
    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_generation_failure_returns_500(
        self, mock_db, mock_generate, client, mock_resume_record, sample_resume
    ):
        mock_db.get_resume.return_value = {
            **mock_resume_record,
            "parent_id": "master-1",
            "processed_data": sample_resume,
        }
        mock_db.get_improvement_by_tailored_resume.return_value = {"job_id": "job-1"}
        mock_db.get_job.return_value = {"job_id": "job-1", "content": "Need FastAPI"}
        mock_generate.side_effect = RuntimeError("llm failed")

        async with client:
            resp = await client.post("/api/v1/resumes/res-123/generate-interview-prep")

        assert resp.status_code == 500
        assert "Failed to generate interview preparation" in resp.json()["detail"]


class TestRetryProcessing:
    """POST /api/v1/resumes/{resume_id}/retry-processing"""

    @patch("app.routers.resumes.parse_resume_to_json", new_callable=AsyncMock)
    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_retry_successful(self, mock_db, mock_parse, client, mock_resume_record, sample_resume):
        failed_record = {**mock_resume_record, "processing_status": "failed"}
        mock_db.get_resume.return_value = failed_record
        mock_parse.return_value = sample_resume
        mock_db.update_resume.return_value = {**failed_record, "processing_status": "ready", "processed_data": sample_resume}
        async with client:
            resp = await client.post("/api/v1/resumes/res-123/retry-processing")
        assert resp.status_code == 200
        data = resp.json()
        assert data["processing_status"] == "ready"

    @patch("app.routers.resumes.db", new_callable=AsyncMock)
    async def test_retry_not_failed_returns_400(self, mock_db, client, mock_resume_record):
        # processing_status is "ready", not "failed"
        mock_db.get_resume.return_value = mock_resume_record
        async with client:
            resp = await client.post("/api/v1/resumes/res-123/retry-processing")
        assert resp.status_code == 400


class TestUploadResume:
    """POST /api/v1/resumes/upload"""

    @patch("app.routers.resumes.parse_resume_to_json", new_callable=AsyncMock)
    @patch("app.routers.resumes.parse_document", new_callable=AsyncMock)
    @patch("app.routers.resumes.db")
    async def test_upload_empty_extracted_text_returns_422(
        self, mock_db, mock_parse_document, mock_parse_resume_to_json, client
    ):
        mock_parse_document.return_value = "   "

        async with client:
            resp = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.pdf", b"fake pdf bytes", "application/pdf")},
            )

        assert resp.status_code == 422
        assert "Could not extract text from the uploaded file" in resp.json()["detail"]
        mock_db.create_resume_atomic_master.assert_not_called()
        mock_parse_resume_to_json.assert_not_called()
