"""Integration tests for job description endpoints."""

from unittest.mock import patch, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestJobUpload:
    """POST /api/v1/jobs/upload"""

    @patch("app.routers.jobs.db")
    async def test_upload_single_job(self, mock_db, client):
        mock_db.create_job.return_value = {
            "job_id": "job-123",
            "content": "Senior Engineer at TechCorp",
            "created_at": "2026-01-01T00:00:00Z",
        }
        async with client:
            resp = await client.post("/api/v1/jobs/upload", json={
                "job_descriptions": ["Senior Engineer at TechCorp"],
                "resume_id": None,
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "data successfully processed"
        assert len(data["job_id"]) == 1

    @patch("app.routers.jobs.db")
    async def test_upload_multiple_jobs(self, mock_db, client):
        mock_db.create_job.side_effect = [
            {"job_id": f"job-{i}", "content": f"JD {i}", "created_at": "2026-01-01T00:00:00Z"}
            for i in range(3)
        ]
        async with client:
            resp = await client.post("/api/v1/jobs/upload", json={
                "job_descriptions": ["JD 1", "JD 2", "JD 3"],
            })
        assert resp.status_code == 200
        assert len(resp.json()["job_id"]) == 3

    async def test_upload_empty_list_returns_400(self, client):
        async with client:
            resp = await client.post("/api/v1/jobs/upload", json={
                "job_descriptions": [],
            })
        assert resp.status_code == 400

    async def test_upload_empty_string_returns_400(self, client):
        async with client:
            resp = await client.post("/api/v1/jobs/upload", json={
                "job_descriptions": ["  "],
            })
        assert resp.status_code == 400


class TestGetJob:
    """GET /api/v1/jobs/{job_id}"""

    @patch("app.routers.jobs.db")
    async def test_get_existing_job(self, mock_db, client):
        mock_db.get_job.return_value = {
            "job_id": "job-123",
            "content": "Engineer role",
            "created_at": "2026-01-01T00:00:00Z",
        }
        async with client:
            resp = await client.get("/api/v1/jobs/job-123")
        assert resp.status_code == 200
        assert resp.json()["job_id"] == "job-123"

    @patch("app.routers.jobs.db")
    async def test_get_nonexistent_job_returns_404(self, mock_db, client):
        mock_db.get_job.return_value = None
        async with client:
            resp = await client.get("/api/v1/jobs/nonexistent")
        assert resp.status_code == 404
