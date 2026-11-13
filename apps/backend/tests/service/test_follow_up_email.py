"""The follow-up email generator: what it sends the model and what it returns."""

import json
from unittest.mock import AsyncMock, patch

from app.services.cover_letter import generate_follow_up_email

RESUME = {
    "personalInfo": {"name": "Sam Rivera"},
    "summary": "Built Python APIs serving 50K requests/day",
}
JOB = "Backend engineer at Acme: improve API reliability"


async def _draft(days_since_applied: int | None) -> tuple[str, str]:
    """Return (result, prompt sent to the model)."""
    with patch(
        "app.services.cover_letter.complete",
        new_callable=AsyncMock,
        return_value="  Subject: Backend Engineer application\n\nHello,\n",
    ) as complete:
        result = await generate_follow_up_email(
            RESUME,
            JOB,
            company="ACME",
            role="Backend Engineer",
            days_since_applied=days_since_applied,
            language="es",
        )
    complete.assert_awaited_once()
    return result, complete.call_args.kwargs["prompt"]


async def test_prompt_carries_the_application_job_and_resume() -> None:
    result, prompt = await _draft(days_since_applied=12)

    assert result == "Subject: Backend Engineer application\n\nHello,"
    assert "Company: ACME" in prompt
    assert "Role: Backend Engineer" in prompt
    assert "Applied: 12 days ago" in prompt
    assert JOB in prompt
    assert json.dumps(RESUME) in prompt
    assert "Write in Spanish" in prompt


async def test_unknown_applied_date_is_left_out_of_the_prompt() -> None:
    _, prompt = await _draft(days_since_applied=None)

    assert "Applied:" not in prompt
    assert "Company: ACME" in prompt
