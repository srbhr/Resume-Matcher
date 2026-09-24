"""Integration tests for the Kanban application-tracker API (real isolated DB)."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Database
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


class TestInterviewQuestions:
    async def test_create_question_appears_in_detail_and_global_list(self, isolated_db):
        card = await _seed_card(
            isolated_db,
            job_id="job-questions",
            resume_id="res-questions",
            company="Acme Corp",
            role="Backend Engineer",
        )

        async with _client() as client:
            created = await client.post(
                f"/api/v1/applications/{card['application_id']}/interview-questions",
                json={"question": "  Explain database transaction isolation.  "},
            )
        assert created.status_code == 200
        created_body = created.json()
        assert created_body["question"] == "Explain database transaction isolation."
        assert created_body["company"] == "Acme Corp"
        assert created_body["role"] == "Backend Engineer"

        async with _client() as client:
            detail = await client.get(
                f"/api/v1/applications/{card['application_id']}"
            )
            global_list = await client.get("/api/v1/applications/interview-questions")

        assert detail.status_code == 200
        assert [item["question_id"] for item in detail.json()["interview_questions"]] == [
            created_body["question_id"]
        ]
        assert global_list.status_code == 200
        assert global_list.json()["questions"][0]["question"] == created_body["question"]

    async def test_global_list_uses_live_company_and_role(self, isolated_db):
        card = await _seed_card(
            isolated_db,
            job_id="job-live-context",
            resume_id="res-live-context",
            company="Old Co",
            role="Engineer",
        )
        await isolated_db.create_interview_question(card["application_id"], "Why this role?")
        await isolated_db.update_application(
            card["application_id"],
            {"company": "New Co", "role": "Staff Engineer"},
        )

        async with _client() as client:
            resp = await client.get("/api/v1/applications/interview-questions")

        assert resp.status_code == 200
        question = resp.json()["questions"][0]
        assert question["company"] == "New Co"
        assert question["role"] == "Staff Engineer"

    async def test_question_survives_status_move(self, isolated_db):
        card = await _seed_card(
            isolated_db,
            job_id="job-move-question",
            resume_id="res-move-question",
            company="Acme",
        )
        await isolated_db.create_interview_question(card["application_id"], "Tell me about a failure.")

        async with _client() as client:
            moved = await client.patch(
                f"/api/v1/applications/{card['application_id']}",
                json={"status": "interview"},
            )
            global_list = await client.get("/api/v1/applications/interview-questions")

        assert moved.status_code == 200
        assert global_list.json()["questions"][0]["application_id"] == card["application_id"]

    async def test_blank_question_is_rejected(self, isolated_db):
        card = await _seed_card(
            isolated_db,
            job_id="job-blank-question",
            resume_id="res-blank-question",
        )
        async with _client() as client:
            resp = await client.post(
                f"/api/v1/applications/{card['application_id']}/interview-questions",
                json={"question": "   "},
            )
        assert resp.status_code == 422

    async def test_unknown_application_returns_404(self, isolated_db):
        async with _client() as client:
            resp = await client.post(
                "/api/v1/applications/does-not-exist/interview-questions",
                json={"question": "Why this company?"},
            )
        assert resp.status_code == 404

    async def test_delete_question_removes_it_from_detail_and_global_list(self, isolated_db):
        card = await _seed_card(
            isolated_db,
            job_id="job-delete-question",
            resume_id="res-delete-question",
            company="Acme",
        )
        question = await isolated_db.create_interview_question(
            card["application_id"], "Why this company?"
        )

        async with _client() as client:
            deleted = await client.delete(
                f"/api/v1/applications/{card['application_id']}"
                f"/interview-questions/{question['question_id']}"
            )
            detail = await client.get(
                f"/api/v1/applications/{card['application_id']}"
            )
            global_list = await client.get("/api/v1/applications/interview-questions")

        assert deleted.status_code == 200
        assert deleted.json()["affected"] == 1
        assert detail.json()["interview_questions"] == []
        assert global_list.json()["questions"] == []

    async def test_delete_question_rejects_wrong_application(self, isolated_db):
        first = await _seed_card(
            isolated_db,
            job_id="job-delete-first",
            resume_id="res-delete-first",
        )
        second = await _seed_card(
            isolated_db,
            job_id="job-delete-second",
            resume_id="res-delete-second",
        )
        question = await isolated_db.create_interview_question(
            first["application_id"], "Question?"
        )

        async with _client() as client:
            resp = await client.delete(
                f"/api/v1/applications/{second['application_id']}"
                f"/interview-questions/{question['question_id']}"
            )

        assert resp.status_code == 404
        assert len(await isolated_db.list_interview_questions()) == 1


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

    async def test_patch_interview_times_persists_and_survives_status_change(
        self, isolated_db
    ):
        card = await _seed_card(isolated_db, status="interview")
        async with _client() as client:
            updated = await client.patch(
                f"/api/v1/applications/{card['application_id']}",
                json={
                    "interview_times": [
                        "2026-10-02T14:30",
                        "2026-10-08T10:00:00",
                    ]
                },
            )
        assert updated.status_code == 200
        assert updated.json()["interview_times"] == [
            "2026-10-02T14:30",
            "2026-10-08T10:00",
        ]

        async with _client() as client:
            moved = await client.patch(
                f"/api/v1/applications/{card['application_id']}",
                json={"status": "accepted"},
            )
            detail = await client.get(
                f"/api/v1/applications/{card['application_id']}"
            )
        assert moved.status_code == 200
        assert moved.json()["interview_times"] == updated.json()["interview_times"]
        assert detail.json()["interview_times"] == updated.json()["interview_times"]

    async def test_patch_rejects_invalid_or_timezone_aware_interview_times(
        self, isolated_db
    ):
        card = await _seed_card(isolated_db, status="interview")
        async with _client() as client:
            invalid = await client.patch(
                f"/api/v1/applications/{card['application_id']}",
                json={"interview_times": ["not-a-date"]},
            )
            timezone_aware = await client.patch(
                f"/api/v1/applications/{card['application_id']}",
                json={"interview_times": ["2026-10-02T14:30:00+08:00"]},
            )
        assert invalid.status_code == 422
        assert timezone_aware.status_code == 422

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


class TestRobustnessFixes:
    async def test_create_dedupes_same_job_resume(self, isolated_db):
        """A second card for the same (job, resume) returns the existing one."""
        first = await _seed_card(isolated_db, job_id="dup-j", resume_id="dup-r", status="applied")
        second = await isolated_db.create_application(
            job_id="dup-j", resume_id="dup-r", status="applied"
        )
        assert second["application_id"] == first["application_id"]
        async with _client() as client:
            board = (await client.get("/api/v1/applications")).json()["columns"]
        assert len(board["applied"]) == 1

    async def test_unknown_status_is_skipped_not_500(self, isolated_db):
        """A row whose status is outside the enum must not 500 the board."""
        await isolated_db.create_application(job_id="j1", resume_id="r1", status="bogus_status")
        await _seed_card(isolated_db, job_id="j2", resume_id="r2", status="applied")
        async with _client() as client:
            resp = await client.get("/api/v1/applications")
        assert resp.status_code == 200
        columns = resp.json()["columns"]
        assert "bogus_status" not in columns
        assert len(columns["applied"]) == 1  # the valid card still renders

    async def test_manual_add_cleans_up_orphan_job_on_failure(
        self, isolated_db: Database
    ) -> None:
        """If application creation fails, the just-created job is removed."""
        with patch.object(
            isolated_db,
            "_insert_application",
            new_callable=AsyncMock,
            side_effect=RuntimeError("boom"),
        ):
            async with _client() as client:
                resp = await client.post(
                    "/api/v1/applications",
                    json={
                        "resume_id": "res-1",
                        "job_description": "JD text",
                        "company": "Given Co",
                        "role": "Given Role",
                    },
                )
        assert resp.status_code == 500
        stats = await isolated_db.get_stats()
        assert stats["total_jobs"] == 0  # no orphan job left behind
