"""End-to-end pipeline test through the REAL routers + a REAL (isolated) TinyDB.

Every existing integration test mocks the database away (``patch("...db")``), so
nothing proves that the core user journey actually persists through the routers.
This module fills that gap: it drives the genuine FastAPI app against the
disposable ``isolated_db`` fixture (a temp-file ``Database`` swapped into every
router module) and asserts real persisted state via the yielded db — not just
status codes. Only the LLM boundaries are mocked; the routers, schemas,
validation, and TinyDB persistence are all real.

Pipeline stages covered:
    upload  -> POST /api/v1/resumes/upload (parse_document + parse_resume_to_json mocked)
    jobs    -> POST /api/v1/jobs/upload
    fetch   -> GET  /api/v1/resumes?resume_id=...
    improve -> POST /api/v1/resumes/improve/preview then /improve/confirm
               (every LLM-touching service in the diff flow mocked)

The real LLM is NEVER called: parse_resume_to_json, extract_job_keywords,
generate_skill_target_plan, generate_resume_diffs, refine_resume, and the
auxiliary cover-letter/outreach/title generators are all replaced with
Mock/AsyncMock returning canned data.
"""

import copy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.models import ResumeData


def _new_client():
    """A fresh ASGI-in-process client.

    httpx.AsyncClient cannot be reopened once its ``async with`` block exits, so
    multi-request flows construct one client per request rather than reusing a
    single fixture instance.
    """
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
def client():
    """Async HTTP client bound to the real FastAPI app (ASGI in-process)."""
    return _new_client()


async def _upload_resume(isolated_db, sample_resume):
    """Upload a fake PDF through the real router with the parse boundary mocked.

    Returns the upload response. parse_document yields markdown and
    parse_resume_to_json yields the structured ``sample_resume`` dict, so the
    upload should end in ``processing_status == "ready"`` with ``sample_resume``
    persisted as ``processed_data``.
    """
    markdown = "# Jane Doe\nSenior Backend Engineer\njane@example.com\n"
    with (
        patch(
            "app.routers.resumes.parse_document",
            new_callable=AsyncMock,
            return_value=markdown,
        ),
        patch(
            "app.routers.resumes.parse_resume_to_json",
            new_callable=AsyncMock,
            return_value=copy.deepcopy(sample_resume),
        ),
    ):
        async with _new_client() as client:
            resp = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )
    return resp


class TestPipelineCore:
    """The minimum bar: upload -> store -> jobs -> fetch, end to end."""

    async def test_upload_persists_master_resume_through_router(
        self, isolated_db, sample_resume
    ):
        """Upload a fake PDF; assert the resume is the persisted master, marked
        ``ready``, with ``processed_data`` round-tripped through real TinyDB.

        This proves the upload handler actually wires parse_document ->
        parse_resume_to_json -> create_resume_atomic_master -> update_resume
        against a real database, which the DB-mocking tests cannot.
        """
        resp = await _upload_resume(isolated_db, sample_resume)

        assert resp.status_code == 200
        body = resp.json()
        assert body["processing_status"] == "ready"
        assert body["is_master"] is True
        resume_id = body["resume_id"]
        assert resume_id

        # Inspect REAL persisted state via the yielded isolated db.
        master = isolated_db.get_master_resume()
        assert master is not None
        assert master["resume_id"] == resume_id
        assert master["processing_status"] == "ready"
        assert master["is_master"] is True
        # processed_data round-tripped through TinyDB JSON storage.
        assert master["processed_data"] is not None
        assert master["processed_data"]["personalInfo"]["name"] == "Jane Doe"
        assert (
            master["processed_data"]["summary"] == sample_resume["summary"]
        )
        # Exactly one resume exists, and it is the master.
        assert len(isolated_db.list_resumes()) == 1

    async def test_jobs_upload_persists_job_through_router(
        self, isolated_db, client
    ):
        """POST /jobs/upload stores the JD text and returns a job_id that is
        actually retrievable from the real db; stats reflect one job.

        Fixture safety: ``isolated_db`` is listed before ``client`` (pytest
        resolves same-scope fixtures left-to-right), and the routers look up the
        module-global ``db`` at REQUEST time — so the monkeypatched isolated db
        is always the one the ASGI app reads, independent of when ``client`` was
        constructed.
        """
        async with client:
            resp = await client.post(
                "/api/v1/jobs/upload",
                json={
                    "job_descriptions": [
                        "Senior Python role building scalable FastAPI services. "
                        "Docker and AWS required."
                    ]
                },
            )

        assert resp.status_code == 200
        body = resp.json()
        job_ids = body["job_id"]
        assert isinstance(job_ids, list)
        assert len(job_ids) == 1
        job_id = job_ids[0]

        # Real persistence check via the yielded db.
        stored_job = isolated_db.get_job(job_id)
        assert stored_job is not None
        assert "FastAPI" in stored_job["content"]
        assert isolated_db.get_stats()["total_jobs"] == 1

    async def test_full_journey_upload_jobs_then_fetch(
        self, isolated_db, sample_resume
    ):
        """The cohesive core journey in one flow: upload a resume, upload a job,
        then fetch the resume back by id — all through real routers + real db.

        Asserts the fetched ``processed_resume`` (a fully validated ResumeData)
        carries the expected summary, proving the stored data survives the
        round trip out through the GET handler. Also confirms both the resume
        and the job coexist in the same isolated database.
        """
        # 1. Upload.
        upload_resp = await _upload_resume(isolated_db, sample_resume)
        assert upload_resp.status_code == 200
        resume_id = upload_resp.json()["resume_id"]

        # The resume_id is recoverable from the db too (anti-theater).
        listed = isolated_db.list_resumes()
        assert resume_id in {r["resume_id"] for r in listed}

        # 2. Jobs upload.
        async with _new_client() as client:
            jobs_resp = await client.post(
                "/api/v1/jobs/upload",
                json={"job_descriptions": ["Senior Python role at TechCorp."]},
            )
        assert jobs_resp.status_code == 200
        job_id = jobs_resp.json()["job_id"][0]
        assert isolated_db.get_job(job_id) is not None

        # 3. Fetch the resume back through the real GET handler.
        async with _new_client() as client:
            fetch_resp = await client.get(
                "/api/v1/resumes", params={"resume_id": resume_id}
            )
        assert fetch_resp.status_code == 200
        data = fetch_resp.json()["data"]
        assert data["resume_id"] == resume_id
        assert data["raw_resume"]["processing_status"] == "ready"
        processed = data["processed_resume"]
        assert processed is not None
        assert processed["personalInfo"]["name"] == "Jane Doe"
        assert processed["summary"] == sample_resume["summary"]

        # Both resume and job live in the same isolated db.
        stats = isolated_db.get_stats()
        assert stats["total_resumes"] == 1
        assert stats["total_jobs"] == 1
        assert stats["has_master_resume"] is True

    async def test_fetch_unknown_resume_returns_404(self, isolated_db, client):
        """Fetching a non-existent id is a real 404 from the GET handler against
        an empty isolated db (sanity guard that the fixture starts clean)."""
        async with client:
            resp = await client.get(
                "/api/v1/resumes", params={"resume_id": "does-not-exist"}
            )
        assert resp.status_code == 404
        assert isolated_db.list_resumes() == []


class TestTailoringPipeline:
    """Stretch: the preview -> confirm tailoring handshake, end to end.

    The diff-based improve flow calls many LLM services. We mock every
    LLM-touching boundary imported into ``app.routers.resumes`` so the flow is
    deterministic, drive a real ``/improve/preview``, then echo the returned
    ``resume_preview`` back into ``/improve/confirm`` (exactly as the real
    client does). Confirm re-hashes the payload and validates the preview_hash
    persisted on the job, so a self-consistent round trip is what proves the
    handshake + tailored-resume persistence actually wire together.

    Refinement (``refine_resume``) is mocked to raise: the router explicitly
    catches refinement failures and falls back to the unrefined result, so the
    preview_hash is computed on our canned ``improved_data`` and the
    brittle ``RefinementResult`` attribute surface never has to be faked.
    """

    async def test_preview_then_confirm_persists_tailored_resume(
        self, isolated_db, sample_resume
    ):
        # Seed a master resume (with processed_data so the diff path runs) and a
        # job, both through the real upload routers.
        upload_resp = await _upload_resume(isolated_db, sample_resume)
        assert upload_resp.status_code == 200
        resume_id = upload_resp.json()["resume_id"]

        async with _new_client() as client:
            jobs_resp = await client.post(
                "/api/v1/jobs/upload",
                json={
                    "job_descriptions": [
                        "Senior Backend Engineer: Python, FastAPI, Docker, AWS."
                    ]
                },
            )
        assert jobs_resp.status_code == 200
        job_id = jobs_resp.json()["job_id"][0]

        # Canned tailored resume: identical personalInfo (required by the confirm
        # invariant) with a tweaked summary so we can prove the *tailored* copy
        # is what gets stored.
        #
        # Run it through ResumeData first so it carries the full, default-filled
        # key set the real ``parse_resume_to_json``/``apply_diffs`` pipeline
        # produces. The preview hashes this raw dict, while the preview *response*
        # serializes ``ResumeData.model_validate(...)``; canonicalizing here makes
        # the two byte-identical (mirroring production, where stored processed_data
        # is already Pydantic-normalized) so the confirm preview_hash matches.
        improved = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
        improved["summary"] = (
            "Senior backend engineer with 6 years building scalable Python and "
            "FastAPI services on AWS and Docker."
        )

        diff_result = SimpleNamespace(changes=[])

        with (
            patch(
                "app.routers.resumes.extract_job_keywords",
                new_callable=AsyncMock,
                return_value={"keywords": ["Python", "FastAPI"], "required_skills": []},
            ),
            patch(
                "app.routers.resumes.generate_skill_target_plan",
                new_callable=AsyncMock,
                return_value={"accepted": [], "rejected": []},
            ),
            patch(
                "app.routers.resumes.verify_skill_target_plan",
                return_value={"accepted": [], "rejected": []},
            ),
            patch(
                "app.routers.resumes.generate_resume_diffs",
                new_callable=AsyncMock,
                return_value=diff_result,
            ),
            patch(
                "app.routers.resumes.apply_diffs",
                return_value=(copy.deepcopy(improved), [], []),
            ),
            patch("app.routers.resumes.verify_diff_result", return_value=[]),
            # Force the unrefined fallback path (handled gracefully by the router)
            # so we don't have to fake the RefinementResult object.
            patch(
                "app.routers.resumes.refine_resume",
                new_callable=AsyncMock,
                side_effect=RuntimeError("refinement disabled for test"),
            ),
            # Auxiliary generators are awaited in confirm; keep them cheap.
            patch(
                "app.routers.resumes.generate_resume_title",
                new_callable=AsyncMock,
                return_value="Senior Backend Engineer - TechCorp",
            ),
        ):
            # --- Preview (no persistence; resume_id stays null) ---
            async with _new_client() as client:
                preview_resp = await client.post(
                    "/api/v1/resumes/improve/preview",
                    json={"resume_id": resume_id, "job_id": job_id},
                )
            assert preview_resp.status_code == 200, preview_resp.text
            preview_data = preview_resp.json()["data"]
            assert preview_data["resume_id"] is None
            assert preview_data["job_id"] == job_id
            preview_resume = preview_data["resume_preview"]
            assert preview_resume["summary"] == improved["summary"]
            # Preview must NOT have persisted a tailored resume.
            assert isolated_db.get_stats()["total_resumes"] == 1
            # The preview_hash was persisted on the job for the confirm handshake.
            job_after_preview = isolated_db.get_job(job_id)
            assert job_after_preview.get("preview_hash")

            # --- Confirm (echo the preview back, exactly as the client does) ---
            async with _new_client() as client:
                confirm_resp = await client.post(
                    "/api/v1/resumes/improve/confirm",
                    json={
                        "resume_id": resume_id,
                        "job_id": job_id,
                        "improved_data": preview_resume,
                        "improvements": preview_data["improvements"],
                    },
                )
            assert confirm_resp.status_code == 200, confirm_resp.text

        confirm_data = confirm_resp.json()["data"]
        tailored_id = confirm_data["resume_id"]
        assert tailored_id is not None
        assert tailored_id != resume_id

        # The tailored resume is REALLY persisted, as a non-master child of the
        # original, carrying the tailored summary.
        stored_tailored = isolated_db.get_resume(tailored_id)
        assert stored_tailored is not None
        assert stored_tailored["is_master"] is False
        assert stored_tailored["parent_id"] == resume_id
        assert stored_tailored["processing_status"] == "ready"
        assert stored_tailored["processed_data"]["summary"] == improved["summary"]
        # personalInfo preserved from the master (the confirm invariant).
        assert (
            stored_tailored["processed_data"]["personalInfo"]
            == sample_resume["personalInfo"]
        )

        # An improvements record links original -> tailored for this job.
        improvement = isolated_db.get_improvement_by_tailored_resume(tailored_id)
        assert improvement is not None
        assert improvement["original_resume_id"] == resume_id
        assert improvement["job_id"] == job_id

        # Master + tailored both present; master unchanged.
        stats = isolated_db.get_stats()
        assert stats["total_resumes"] == 2
        assert stats["total_improvements"] == 1
        master = isolated_db.get_master_resume()
        assert master["resume_id"] == resume_id
        assert master["processed_data"]["summary"] == sample_resume["summary"]

    async def test_preview_confirm_succeeds_for_non_canonical_stored_resume(
        self, isolated_db, sample_resume
    ):
        """A stored resume whose ``processed_data`` OMITS optional schema fields
        must still tailor + confirm successfully (regression for the confirm 400).

        ``improve/preview`` hashes the raw ``improved_data`` — here a project that
        omits the optional ``github``/``website`` keys ``ResumeData`` defaults to
        ``None`` — while ``improve/confirm`` hashes the schema-defaulted
        ``ResumeData`` round-trip. Before ``_hash_improved_data`` canonicalized
        both sides these diverged and confirm returned 400 ("preview hash
        mismatch"). NO canonicalize workaround is applied to ``improved`` here —
        that is exactly the point.
        """
        upload_resp = await _upload_resume(isolated_db, sample_resume)
        assert upload_resp.status_code == 200
        resume_id = upload_resp.json()["resume_id"]

        async with _new_client() as client:
            jobs_resp = await client.post(
                "/api/v1/jobs/upload",
                json={"job_descriptions": ["Senior Backend Engineer: Python, FastAPI."]},
            )
        assert jobs_resp.status_code == 200
        job_id = jobs_resp.json()["job_id"][0]

        # Non-canonical tailored data: a project missing the optional
        # github/website fields. personalInfo stays canonical/unchanged so the
        # confirm identity invariant holds; only personalProjects is non-canonical.
        improved = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
        improved["summary"] = (
            "Senior backend engineer building Python and FastAPI services."
        )
        improved["personalProjects"] = [
            {
                "id": 1,
                "name": "Sidecar",
                "role": "Author",
                "years": "2022",
                "description": ["Shipped a CLI"],
            }  # deliberately NO github/website keys
        ]
        assert "github" not in improved["personalProjects"][0]

        with (
            patch(
                "app.routers.resumes.extract_job_keywords",
                new_callable=AsyncMock,
                return_value={"keywords": ["Python", "FastAPI"], "required_skills": []},
            ),
            patch(
                "app.routers.resumes.generate_skill_target_plan",
                new_callable=AsyncMock,
                return_value={"accepted": [], "rejected": []},
            ),
            patch(
                "app.routers.resumes.verify_skill_target_plan",
                return_value={"accepted": [], "rejected": []},
            ),
            patch(
                "app.routers.resumes.generate_resume_diffs",
                new_callable=AsyncMock,
                return_value=SimpleNamespace(changes=[]),
            ),
            patch(
                "app.routers.resumes.apply_diffs",
                return_value=(copy.deepcopy(improved), [], []),
            ),
            patch("app.routers.resumes.verify_diff_result", return_value=[]),
            patch(
                "app.routers.resumes.refine_resume",
                new_callable=AsyncMock,
                side_effect=RuntimeError("refinement disabled for test"),
            ),
            patch(
                "app.routers.resumes.generate_resume_title",
                new_callable=AsyncMock,
                return_value="Senior Backend Engineer",
            ),
        ):
            async with _new_client() as client:
                preview_resp = await client.post(
                    "/api/v1/resumes/improve/preview",
                    json={"resume_id": resume_id, "job_id": job_id},
                )
            assert preview_resp.status_code == 200, preview_resp.text
            preview_data = preview_resp.json()["data"]
            preview_resume = preview_data["resume_preview"]
            # The preview RESPONSE is schema-complete even though the stored
            # improved_data wasn't — this asymmetry is what used to break confirm.
            assert "github" in preview_resume["personalProjects"][0]

            async with _new_client() as client:
                confirm_resp = await client.post(
                    "/api/v1/resumes/improve/confirm",
                    json={
                        "resume_id": resume_id,
                        "job_id": job_id,
                        "improved_data": preview_resume,
                        "improvements": preview_data["improvements"],
                    },
                )
            assert confirm_resp.status_code == 200, confirm_resp.text

        # The tailored resume really persisted as a child of the master.
        tailored_id = confirm_resp.json()["data"]["resume_id"]
        assert tailored_id is not None and tailored_id != resume_id
        assert isolated_db.get_resume(tailored_id) is not None
