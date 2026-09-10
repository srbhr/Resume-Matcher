"""Public error boundaries preserve item results and committed upload identity."""

import asyncio
import copy
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app import ai_limits
from app.ai_budget import AIOperationDeadlineExceeded
from app.config import settings
from app.database import Database
from app.main import app
from app.routers import enrichment, resumes
from tests.integration.test_ai_result_contracts import _enhance_request, _source_resume
from tests.integration.test_upload_processing import _docx_bytes


@pytest.mark.parametrize("oversized_first", [False, True])
async def test_enhancement_prompt_limit_keeps_other_items(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    oversized_first: bool,
) -> None:
    source_data = copy.deepcopy(sample_resume)
    source_data["personalProjects"][0]["description"] = ["x" * 20_000]
    source = await _source_resume(isolated_db, source_data)
    monkeypatch.setattr(ai_limits, "MAX_PROMPT_CHARACTERS", 10_000)

    async def complete(prompt: str, **_kwargs: Any) -> dict[str, Any]:
        ai_limits.validate_prompt_size(prompt)
        return {"additional_bullets": ["Built a reliable service"]}

    monkeypatch.setattr(enrichment, "complete_json", complete)
    payload = _enhance_request(source["resume_id"], include_project=True)
    if oversized_first:
        payload["answers"].reverse()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/enrichment/enhance", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["item_id"] for item in body["enhancements"]] == ["exp_0"]
    assert body["enhancements"][0]["enhanced_description"] == ["Built a reliable service"]
    assert [item["item_id"] for item in body["errors"]] == ["proj_0"]
    assert "too large" in body["errors"][0]["message"]
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == source_data

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        applied = await client.post(
            f"/api/v1/enrichment/apply/{source['resume_id']}",
            json={"enhancements": body["enhancements"]},
        )
    assert applied.status_code == 200
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None
    assert stored["processed_data"]["personalProjects"] == source_data["personalProjects"]
    assert stored["processed_data"]["workExperience"][0]["description"] == (
        source_data["workExperience"][0]["description"] + ["Built a reliable service"]
    )


async def test_enhancement_total_deadline_still_discards_partial_preview(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = await _source_resume(isolated_db, sample_resume)
    monkeypatch.setattr(settings, "request_timeout_seconds", 0.15)
    calls = 0
    cancelled = asyncio.Event()

    async def complete(_prompt: str, **_kwargs: Any) -> dict[str, Any]:
        nonlocal calls
        calls += 1
        if calls > 1:
            try:
                await asyncio.sleep(10)
            finally:
                cancelled.set()
        return {"additional_bullets": ["Built a reliable service"]}

    monkeypatch.setattr(enrichment, "complete_json", complete)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await asyncio.wait_for(client.post(
            "/api/v1/enrichment/enhance",
            json=_enhance_request(source["resume_id"], include_project=True),
        ), timeout=1)
    assert response.status_code == 504
    assert calls == 2 and cancelled.is_set()
    assert set(response.json()) == {"detail"}
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == sample_resume


@pytest.mark.parametrize("failure", ["prompt", "deadline", "timer"])
async def test_upload_error_identifies_committed_row_for_retry(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    async def parse(_markdown: str) -> dict[str, Any]:
        if failure == "prompt":
            ai_limits.validate_prompt_size("x" * (ai_limits.MAX_PROMPT_CHARACTERS + 1))
        if failure == "deadline":
            raise AIOperationDeadlineExceeded("synthetic exhausted budget")
        await asyncio.sleep(10)
        return {}

    monkeypatch.setattr(resumes, "parse_resume_to_json", parse)
    monkeypatch.setattr(settings, "request_timeout_seconds", 2.0)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await asyncio.wait_for(client.post(
            "/api/v1/resumes/upload",
            files={"file": ("synthetic.docx", _docx_bytes("Synthetic resume"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        ), timeout=4)
        rows = await isolated_db.list_resumes()
        assert len(rows) == 1 and rows[0]["processing_status"] == "failed"
        assert response.status_code == (422 if failure == "prompt" else 504)
        body = response.json()
        assert body.get("resume_id") == rows[0]["resume_id"], body
        assert body.get("is_master") is True
        assert "processing_status" not in body  # Cleanup may still be pending in other races.

        async def recover(_markdown: str) -> dict[str, Any]:
            return sample_resume

        monkeypatch.setattr(resumes, "parse_resume_to_json", recover)
        recovered = await client.post(f"/api/v1/resumes/{body['resume_id']}/retry-processing")
        assert recovered.status_code == 200 and recovered.json()["processing_status"] == "ready"
        assert len(await isolated_db.list_resumes()) == 1

        # A subsequent request on the same client must not inherit the upload receipt.
        invalid = await client.post("/api/v1/resumes/upload", files={
            "file": ("invalid.pdf", b"invalid document", "application/pdf"),
        })
        assert invalid.status_code == 422 and set(invalid.json()) == {"detail"}


async def test_upload_rejection_before_create_has_no_identity(
    isolated_db: Database,
) -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/resumes/upload", files={
            "file": ("invalid.pdf", b"invalid document", "application/pdf"),
        })
    assert response.status_code == 422
    assert set(response.json()) == {"detail"}
    assert await isolated_db.list_resumes() == []
