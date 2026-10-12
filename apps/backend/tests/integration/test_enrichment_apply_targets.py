"""POST /enrichment/apply only edits the entry an item ID names, or nothing."""

import copy
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Database
from app.main import app
from tests.integration.test_ai_result_contracts import _source_resume


def _enhancement(item_id: str, item_type: str = "experience") -> dict[str, Any]:
    return {
        "item_id": item_id,
        "item_type": item_type,
        "title": "Entry",
        "original_description": [],
        "enhanced_description": ["Added bullet"],
    }


async def _apply(resume_id: str, enhancements: list[dict[str, Any]]) -> Any:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.post(
            f"/api/v1/enrichment/apply/{resume_id}",
            json={"enhancements": enhancements},
        )


@pytest.mark.parametrize(
    "item_id", ["exp_-1", "exp_99", "exp_0_extra", "exp_", "proj_0", "exp_ 0"]
)
async def test_unmatched_item_ids_change_nothing(
    isolated_db: Database, sample_resume: dict[str, Any], item_id: str
) -> None:
    source = await _source_resume(isolated_db, sample_resume)
    # A valid item in the same request must not be applied on its own either.
    response = await _apply(
        source["resume_id"], [_enhancement("exp_0"), _enhancement(item_id)]
    )

    assert response.status_code == 409
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None and stored["processed_data"] == sample_resume


async def test_matched_items_append_to_the_named_entries(
    isolated_db: Database, sample_resume: dict[str, Any]
) -> None:
    source = await _source_resume(isolated_db, sample_resume)
    response = await _apply(
        source["resume_id"],
        [_enhancement("exp_0", " Experience "), _enhancement("proj_0", "project")],
    )

    assert response.status_code == 200, response.text
    stored = await isolated_db.get_resume(source["resume_id"])
    assert stored is not None
    expected = copy.deepcopy(sample_resume)
    expected["workExperience"][0]["description"].append("Added bullet")
    expected["personalProjects"][0]["description"].append("Added bullet")
    assert stored["processed_data"]["workExperience"] == expected["workExperience"]
    assert stored["processed_data"]["personalProjects"] == expected["personalProjects"]
