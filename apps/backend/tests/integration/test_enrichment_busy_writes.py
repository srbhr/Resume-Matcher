"""Enrichment writes retain retryable storage outcomes at the HTTP boundary."""

import copy
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.database import Database
from app.main import app
from app.routers import enrichment
from tests.integration.test_storage_busy_writes import fast_busy_database  # noqa: F401


def _apply_request(
    resume_id: str,
    source: dict[str, Any],
    operation: str,
) -> tuple[str, dict[str, Any] | list[dict[str, Any]]]:
    """Build a valid public request that changes one existing experience."""
    experience = source["workExperience"][0]
    item = {
        "item_id": "exp_0",
        "item_type": "experience",
        "title": experience["title"],
        "subtitle": experience["company"],
    }
    if operation == "apply":
        payload: dict[str, Any] | list[dict[str, Any]] = {
            "enhancements": [{
                **item,
                "original_description": experience["description"],
                "enhanced_description": ["Built a reliable service"],
            }],
        }
    else:
        payload = [{
            **item,
            "original_content": experience["description"],
            "new_content": ["Built a reliable service"],
            "diff_summary": "Synthetic regeneration",
        }]
    return f"/api/v1/enrichment/{operation}/{resume_id}", payload


@pytest.mark.parametrize("operation", ["apply", "apply-regenerated"])
async def test_enrichment_write_contention_returns_503_and_retry_commits(
    fast_busy_database: Database,
    sample_resume: dict[str, Any],
    operation: str,
) -> None:
    database = fast_busy_database
    source = await database.create_resume(
        content="Synthetic original",
        processed_data=sample_resume,
        processing_status="ready",
    )
    url, payload = _apply_request(source["resume_id"], sample_resume, operation)
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        async with database._session() as writer:
            await writer.execute(text("BEGIN IMMEDIATE"))
            response = await client.post(url, json=payload)
            unchanged = await database.get_resume(source["resume_id"])
            assert unchanged is not None
            assert unchanged["content"] == "Synthetic original"
            assert unchanged["processed_data"] == sample_resume

        assert response.status_code == 503, response.text
        assert response.headers["retry-after"] == "1"
        assert response.json() == {"detail": "Database is busy. Please retry shortly."}
        retried = await client.post(url, json=payload)
        assert retried.status_code == 200, retried.text
        assert retried.json()["updated_items"] == 1

    expected = copy.deepcopy(sample_resume)
    descriptions = expected["workExperience"][0]["description"]
    expected["workExperience"][0]["description"] = (
        descriptions + ["Built a reliable service"]
        if operation == "apply" else ["Built a reliable service"]
    )
    stored = await database.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == expected


@pytest.mark.parametrize("operation", ["apply", "apply-regenerated"])
async def test_other_enrichment_write_failure_remains_generic_500(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
) -> None:
    source = await isolated_db.create_resume(
        content="Synthetic original",
        processed_data=sample_resume,
        processing_status="ready",
    )
    monkeypatch.setattr(
        isolated_db,
        "update_resume",
        AsyncMock(side_effect=RuntimeError("synthetic private persistence detail")),
    )
    url, payload = _apply_request(source["resume_id"], sample_resume, operation)
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        response = await client.post(url, json=payload)
    assert response.status_code == 500
    assert "retry-after" not in response.headers
    assert response.json() == {"detail": (
        "Failed to save enhancements. Please try again."
        if operation == "apply" else "Failed to save changes. Please try again."
    )}
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == sample_resume


async def test_enhance_preview_does_not_write_under_sqlite_contention(
    fast_busy_database: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database = fast_busy_database
    source = await database.create_resume(
        content="Synthetic original",
        processed_data=sample_resume,
        processing_status="ready",
    )
    monkeypatch.setattr(
        enrichment,
        "complete_json",
        AsyncMock(return_value={"additional_bullets": ["Built a reliable service"]}),
    )
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        async with database._session() as writer:
            await writer.execute(text("BEGIN IMMEDIATE"))
            response = await client.post("/api/v1/enrichment/enhance", json={
                "resume_id": source["resume_id"],
                "answers": [{
                    "item_id": "exp_0",
                    "question_id": "q-exp",
                    "answer": "Built a reliable service",
                }],
            })
    assert response.status_code == 200, response.text
    assert response.json()["enhancements"][0]["enhanced_description"] == [
        "Built a reliable service",
    ]
    stored = await database.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == sample_resume
