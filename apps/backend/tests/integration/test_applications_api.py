"""Integration tests for the Kanban application-tracker API (real isolated DB)."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.applications import APPLICATION_STATUS_ORDER


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _seed_card(isolated_db, **kwargs):
    """Create a card directly on the DB (bypassing the LLM manual-add path)."""
    defaults = dict(job_id="job-1", resume_id="res-1", status="applied")
    defaults.update(kwargs)
    return await isolated_db.create_application(**defaults)


class TestListAndGroup:
    async def test_empty_board_has_all_seven_columns(self, isolated_db):
        async with _client() as client:
            resp = await client.get("/api/v1/applications")
        assert resp.status_code == 200
        columns = resp.json()["columns"]
        assert set(columns.keys()) == set(APPLICATION_STATUS_ORDER)
        assert all(columns[s] == [] for s in APPLICATION_STATUS_ORDER)

    async def test_cards_grouped_by_status(self, isolated_db):
        await _seed_card(isolated_db, job_id="j1", resume_id="r1", status="applied")
        await _seed_card(isolated_db, job_id="j2", resume_id="r2", status="interview")
        async with _client() as client:
            resp = await client.get("/api/v1/applications")
        columns = resp.json()["columns"]
        assert len(columns["applied"]) == 1
        assert len(columns["interview"]) == 1
        assert columns["applied"][0]["resume_id"] == "r1"


class TestManualAdd:
    async def test_manual_add_extracts_company_role(self, isolated_db):
        with patch(
            "app.routers.applications.extract_job_keywords",
            new_callable=AsyncMock,
            return_value={"company": "Acme Corp", "role": "Staff Engineer"},
        ):
            async with _client() as client:
                resp = await client.post(
                    "/api/v1/applications",
                    json={
                        "resume_id": "res-1",
                        "job_description": "We are Acme Corp hiring a Staff Engineer...",
                    },
                )
        assert resp.status_code == 200
        body = resp.json()
        assert body["company"] == "Acme Corp"
        assert body["role"] == "Staff Engineer"
        assert body["status"] == "applied"

    async def test_manual_add_respects_explicit_fields_without_llm(self, isolated_db):
        with patch(
            "app.routers.applications.extract_job_keywords",
            new_callable=AsyncMock,
        ) as mock_extract:
            async with _client() as client:
                resp = await client.post(
                    "/api/v1/applications",
                    json={
                        "resume_id": "res-1",
                        "job_description": "JD text",
                        "company": "Given Co",
                        "role": "Given Role",
                        "status": "saved",
                    },
                )
        assert resp.status_code == 200
        # Both fields supplied → no extraction call.
        mock_extract.assert_not_called()
        body = resp.json()
        assert body["company"] == "Given Co"
        assert body["status"] == "saved"
        assert body["applied_at"] is None  # saved is not applied yet


class TestDetail:
    async def test_detail_embeds_job_and_resume(self, isolated_db):
        resume = await isolated_db.create_resume(content="# Resume")
        job = await isolated_db.create_job(content="JD body text")
        card = await _seed_card(isolated_db, job_id=job["job_id"], resume_id=resume["resume_id"])
        async with _client() as client:
            resp = await client.get(f"/api/v1/applications/{card['application_id']}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["job_content"] == "JD body text"
        assert body["resume"]["resume_id"] == resume["resume_id"]

    async def test_detail_tolerates_deleted_resume(self, isolated_db):
        job = await isolated_db.create_job(content="JD")
        card = await _seed_card(isolated_db, job_id=job["job_id"], resume_id="ghost-resume")
        async with _client() as client:
            resp = await client.get(f"/api/v1/applications/{card['application_id']}")
        assert resp.status_code == 200
        assert resp.json()["resume"] is None  # never 500

    async def test_detail_unknown_returns_404(self, isolated_db):
        async with _client() as client:
            resp = await client.get("/api/v1/applications/does-not-exist")
        assert resp.status_code == 404


class TestUpdateAndMove:
    async def test_patch_moves_card_across_columns(self, isolated_db):
        a = await _seed_card(isolated_db, job_id="j1", resume_id="r1", status="applied")
        b = await _seed_card(isolated_db, job_id="j2", resume_id="r2", status="applied")
        async with _client() as client:
            resp = await client.patch(
                f"/api/v1/applications/{a['application_id']}",
                json={"status": "interview", "position": 0},
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "interview"
        # The applied column renumbered so b is now position 0.
        async with _client() as client:
            board = (await client.get("/api/v1/applications")).json()["columns"]
        assert board["applied"][0]["application_id"] == b["application_id"]
        assert board["applied"][0]["position"] == 0

    async def test_patch_notes_and_company(self, isolated_db):
        card = await _seed_card(isolated_db)
        async with _client() as client:
            resp = await client.patch(
                f"/api/v1/applications/{card['application_id']}",
                json={"notes": "Recruiter call Friday", "company": "NewCo"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["notes"] == "Recruiter call Friday"
        assert body["company"] == "NewCo"

    async def test_patch_unknown_returns_404(self, isolated_db):
        async with _client() as client:
            resp = await client.patch("/api/v1/applications/nope", json={"notes": "x"})
        assert resp.status_code == 404


class TestBulkAndDelete:
    async def test_bulk_move(self, isolated_db):
        a = await _seed_card(isolated_db, job_id="j1", resume_id="r1")
        b = await _seed_card(isolated_db, job_id="j2", resume_id="r2")
        async with _client() as client:
            resp = await client.patch(
                "/api/v1/applications/bulk",
                json={"application_ids": [a["application_id"], b["application_id"]], "status": "rejected"},
            )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 2
        async with _client() as client:
            board = (await client.get("/api/v1/applications")).json()["columns"]
        assert len(board["rejected"]) == 2
        assert board["applied"] == []

    async def test_delete_single(self, isolated_db):
        card = await _seed_card(isolated_db)
        async with _client() as client:
            resp = await client.delete(f"/api/v1/applications/{card['application_id']}")
        assert resp.status_code == 200
        async with _client() as client:
            board = (await client.get("/api/v1/applications")).json()["columns"]
        assert board["applied"] == []

    async def test_bulk_delete(self, isolated_db):
        a = await _seed_card(isolated_db, job_id="j1", resume_id="r1")
        b = await _seed_card(isolated_db, job_id="j2", resume_id="r2")
        async with _client() as client:
            resp = await client.post(
                "/api/v1/applications/bulk-delete",
                json={"application_ids": [a["application_id"], b["application_id"]]},
            )
        assert resp.status_code == 200
        assert resp.json()["affected"] == 2
        async with _client() as client:
            board = (await client.get("/api/v1/applications")).json()["columns"]
        assert board["applied"] == []
