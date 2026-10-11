"""Integration tests for job description endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestJobUpload:
    """POST /api/v1/jobs/upload"""

    @patch("app.routers.jobs.db", new_callable=AsyncMock)
    async def test_upload_single_job(
        self, mock_db: AsyncMock, client: AsyncClient
    ) -> None:
        mock_db.create_jobs.return_value = [
            {
                "job_id": "job-123",
                "content": "Senior Engineer at TechCorp",
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
        async with client:
            resp = await client.post(
                "/api/v1/jobs/upload",
                json={
                    "job_descriptions": ["Senior Engineer at TechCorp"],
                    "resume_id": None,
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "data successfully processed"
        assert len(data["job_id"]) == 1

    @patch("app.routers.jobs.db", new_callable=AsyncMock)
    async def test_upload_multiple_jobs(
        self, mock_db: AsyncMock, client: AsyncClient
    ) -> None:
        mock_db.create_jobs.return_value = [
            {
                "job_id": f"job-{i}",
                "content": f"JD {i}",
                "created_at": "2026-01-01T00:00:00Z",
            }
            for i in range(3)
        ]
        async with client:
            resp = await client.post(
                "/api/v1/jobs/upload",
                json={
                    "job_descriptions": ["JD 1", "JD 2", "JD 3"],
                },
            )
        assert resp.status_code == 200
        assert len(resp.json()["job_id"]) == 3

    async def test_upload_empty_list_returns_400(self, client):
        async with client:
            resp = await client.post(
                "/api/v1/jobs/upload",
                json={
                    "job_descriptions": [],
                },
            )
        assert resp.status_code == 400

    async def test_upload_empty_string_returns_400(self, client):
        async with client:
            resp = await client.post(
                "/api/v1/jobs/upload",
                json={
                    "job_descriptions": ["  "],
                },
            )
        assert resp.status_code == 400


class TestGetJob:
    """GET /api/v1/jobs/{job_id}"""

    @patch("app.routers.jobs.db", new_callable=AsyncMock)
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

    @patch("app.routers.jobs.db", new_callable=AsyncMock)
    async def test_get_nonexistent_job_returns_404(self, mock_db, client):
        mock_db.get_job.return_value = None
        async with client:
            resp = await client.get("/api/v1/jobs/nonexistent")
        assert resp.status_code == 404


class TestJobQueue:
    """POST /api/v1/jobs/queue, GET /api/v1/jobs/queue, DELETE /api/v1/jobs/queue/{id}"""

    async def test_parse_metadata_endpoint(self, client):
        async with client:
            resp = await client.post(
                "/api/v1/jobs/parse-metadata",
                json={
                    "job_description": "Job Title: Staff Engineer\nCompany: Acme Corp\nReq ID: REQ-9988\nDetails here...",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "Staff Engineer"
        assert data["company"] == "Acme Corp"
        assert data["job_req_id"] == "REQ-9988"

    @patch("app.routers.jobs.queue_manager")
    @patch("app.routers.jobs.db")
    async def test_add_to_queue_endpoint(self, mock_db, mock_queue_mgr, client):
        mock_db.get_resume = AsyncMock(return_value={"resume_id": "res-master"})
        mock_db.create_queue_item.return_value = {
            "item_id": "queue-1",
            "resume_id": "res-master",
            "job_description": "Job Title: Fullstack Dev\nCompany: Stripe\nRequirements...",
            "role": "Fullstack Dev",
            "company": "Stripe",
            "job_req_id": "",
            "status": "pending",
            "rate_limit_seconds": 5.0,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
        mock_queue_mgr.enqueue_item = AsyncMock()

        async with client:
            resp = await client.post(
                "/api/v1/jobs/queue",
                json={
                    "resume_id": "res-master",
                    "job_description": "Job Title: Fullstack Dev\nCompany: Stripe\nRequirements...",
                    "rate_limit_seconds": 5.0,
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["item_id"] == "queue-1"
        assert data["role"] == "Fullstack Dev"
        assert data["company"] == "Stripe"
        assert data["status"] == "pending"
        assert mock_queue_mgr.enqueue_item.called

    @patch("app.routers.jobs.db")
    async def test_list_queue_endpoint(self, mock_db, client):
        mock_db.get_queue.return_value = [
            {
                "item_id": "queue-1",
                "resume_id": "res-master",
                "job_description": "Frontend Dev at Meta",
                "role": "Frontend Dev",
                "company": "Meta",
                "job_req_id": "",
                "status": "completed",
                "tailored_resume_id": "tailored-1",
                "title": "Frontend Dev @ Meta",
                "rate_limit_seconds": 5.0,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:01:00Z",
            }
        ]
        async with client:
            resp = await client.get("/api/v1/jobs/queue?resume_id=res-master")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "Frontend Dev @ Meta"
        assert data[0]["status"] == "completed"

    @patch("app.routers.jobs.db")
    async def test_delete_queue_item_endpoint(self, mock_db, client):
        mock_db.delete_queue_item.return_value = True
        async with client:
            resp = await client.delete("/api/v1/jobs/queue/queue-1")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

    @patch("app.routers.jobs.db")
    async def test_clear_queue_endpoint(self, mock_db, client):
        mock_db.clear_queue.return_value = 3
        async with client:
            resp = await client.delete("/api/v1/jobs/queue?status=completed")
        assert resp.status_code == 200
        assert resp.json()["cleared_count"] == 3
