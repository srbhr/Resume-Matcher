"""Opt-in generated tailoring evaluation; deterministic contracts live in unit tests.

Run with RM_RUN_PAID_EVAL=1 and explicit provider environment settings:
``uv run pytest tests/evals -m eval``. This executes the actual preview pipeline
for each original/JD and then a grounded judge. It can make several paid calls;
no live quality or commercial ATS accuracy is implied by the offline suite.
"""

from __future__ import annotations

import json
import os
from typing import Any

import pytest

from app.llm import get_llm_config
from e2e_monitor.judge import judge_variation
from tests.evals.golden.cases import GOLDEN_CASES


def _needs_key() -> None:
    if os.environ.get("RM_RUN_PAID_EVAL") != "1":
        pytest.skip("Set RM_RUN_PAID_EVAL=1 to enable generated paid evaluations")
    try:
        config = get_llm_config()
    except Exception:
        pytest.skip("No usable explicit evaluation provider configured")
    if not config.api_key and config.provider not in ("ollama", "openai_compatible"):
        pytest.skip("No LLM key configured for evaluation")


async def generate_tailoring(case: dict[str, Any]) -> dict[str, Any]:
    """Drive the real preview endpoint using the test-owned database."""
    from app.database import db
    from app.routers.resumes import improve_resume_preview_endpoint
    from app.schemas import ImproveResumeRequest, ResumeData

    original = ResumeData.model_validate(case["original"]).model_dump()
    resume = await db.create_resume(
        content=json.dumps(original),
        content_type="json",
        processed_data=original,
        processing_status="ready",
        is_master=True,
    )
    job = await db.create_job(case["job_description"], resume["resume_id"])
    response = await improve_resume_preview_endpoint(
        ImproveResumeRequest(resume_id=resume["resume_id"], job_id=job["job_id"])
    )
    return response.data.resume_preview.model_dump()


async def evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    tailored = await generate_tailoring(case)
    return await judge_variation(case["job_description"], tailored, case["original"])


@pytest.mark.eval
@pytest.mark.parametrize("case", GOLDEN_CASES, ids=lambda case: case["name"])
async def test_llm_judge_scores_good_tailoring_highly(case: dict[str, Any]) -> None:
    _needs_key()
    result = await evaluate_case(case)
    score = result.get("score")
    assert isinstance(score, int) and not isinstance(score, bool) and 1 <= score <= 5
    assert score >= 3, f"Generated tailoring scored below threshold: {result}"
