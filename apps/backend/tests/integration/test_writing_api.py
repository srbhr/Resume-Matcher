"""POST /writing/check and /writing/improve (LLM mocked)."""

import copy
from typing import Any
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient

from app.main import app

WEAK = "Responsible for the migration from monolith to microservices"


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _resume(sample_resume: dict[str, Any]) -> dict[str, Any]:
    data = copy.deepcopy(sample_resume)
    data["workExperience"][0]["description"][1] = WEAK
    return data


async def test_check_scores_with_code_rules(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    async with _client() as client:
        resp = await client.post(
            "/api/v1/writing/check", json={"resume_data": _resume(sample_resume)}
        )
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["score"] < 100
    assert {
        "path": "workExperience[0].description[1]",
        "rule": "weak_opener",
        "severity": "hard",
        "excerpt": WEAK,
    } in body["findings"]


async def test_improve_returns_rewritten_data_and_changes(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    rewrite = "Moved the monolith to microservices, ending shared-release deploys"
    llm = AsyncMock(
        side_effect=[
            {"bullets": []},
            {
                "changes": [
                    {
                        "path": "workExperience[0].description[1]",
                        "action": "replace",
                        "original": WEAK,
                        "value": rewrite,
                        "reason": "weak opener",
                    }
                ]
            },
        ]
    )
    with patch("app.services.writing_loop.complete_json", llm):
        async with _client() as client:
            resp = await client.post(
                "/api/v1/writing/improve",
                json={"resume_data": _resume(sample_resume), "progress_id": "w1"},
            )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["improved_data"]["workExperience"][0]["description"][1] == rewrite
    assert body["changes"] == [
        {"path": "workExperience[0].description[1]", "before": WEAK, "after": rewrite}
    ]
    assert body["writing"]["score"] > body["writing"]["before_score"]
    # Personal info and the other rows are untouched.
    assert body["improved_data"]["personalInfo"] == sample_resume["personalInfo"]


async def test_improve_reports_provider_failure(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    async with _client() as client:
        resp = await client.post(
            "/api/v1/writing/improve", json={"resume_data": _resume(sample_resume)}
        )
    assert resp.status_code == 500
    assert resp.json()["detail"] == "Failed to improve the writing. Please try again."
