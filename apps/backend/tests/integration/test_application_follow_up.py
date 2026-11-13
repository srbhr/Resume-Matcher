"""POST /applications/{id}/follow-up drafts a follow-up email for a tracker card."""

from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient, Response

from app.ai_budget import AIOperationDeadlineExceeded
from app.ai_limits import MAX_JOB_CHARACTERS
from app.main import app

RESUME = {"personalInfo": {"name": "Sam Rivera"}, "summary": "Built Python APIs"}
JOB = "Backend engineer at Acme: improve API reliability"
DRAFT = "Subject: Backend Engineer application\n\nHello,"
GENERATOR = "app.routers.applications.generate_follow_up_email"


async def _seed(
    isolated_db: Any,
    *,
    job: str = JOB,
    resume: dict[str, Any] | None = RESUME,
) -> dict[str, Any]:
    """An Applied card from 12 days ago with its own job and resume."""
    job_row = await isolated_db.create_job(content=job)
    resume_row = await isolated_db.create_resume(
        content="# CV", processed_data=resume, processing_status="ready"
    )
    return await isolated_db.create_application(
        job_id=job_row["job_id"],
        resume_id=resume_row["resume_id"],
        status="applied",
        company="ACME",
        role="Backend Engineer",
        applied_at=(datetime.now(timezone.utc) - timedelta(days=12)).isoformat(),
    )


async def _post(application_id: str) -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.post(f"/api/v1/applications/{application_id}/follow-up")


async def test_drafts_from_the_cards_job_resume_and_applied_date(
    isolated_db: Any,
) -> None:
    card = await _seed(isolated_db)
    with patch(GENERATOR, new_callable=AsyncMock, return_value=DRAFT) as generate:
        response = await _post(card["application_id"])

    assert response.status_code == 200, response.text
    assert response.json()["content"] == DRAFT
    generate.assert_awaited_once_with(
        RESUME,
        JOB,
        company="ACME",
        role="Backend Engineer",
        days_since_applied=12,
        language="en",
    )


async def test_unknown_applied_date_passes_no_day_count(isolated_db: Any) -> None:
    card = await _seed(isolated_db)
    # _seed always sets an applied date; clear it to model an unknown one.
    await isolated_db.update_application(card["application_id"], {"applied_at": None})
    with patch(GENERATOR, new_callable=AsyncMock, return_value=DRAFT) as generate:
        response = await _post(card["application_id"])

    assert response.status_code == 200, response.text
    assert generate.call_args.kwargs["days_since_applied"] is None


async def test_the_draft_is_not_saved(isolated_db: Any) -> None:
    card = await _seed(isolated_db)
    resume_before = await isolated_db.get_resume(card["resume_id"])
    with patch(GENERATOR, new_callable=AsyncMock, return_value=DRAFT):
        response = await _post(card["application_id"])

    assert response.status_code == 200, response.text
    assert await isolated_db.get_application(card["application_id"]) == card
    assert await isolated_db.get_resume(card["resume_id"]) == resume_before


async def test_unknown_card_is_404(isolated_db: Any) -> None:
    with patch(GENERATOR, new_callable=AsyncMock) as generate:
        response = await _post("no-such-card")

    assert response.status_code == 404
    generate.assert_not_awaited()


async def test_card_without_a_parsed_resume_is_400(isolated_db: Any) -> None:
    card = await _seed(isolated_db, resume=None)
    with patch(GENERATOR, new_callable=AsyncMock) as generate:
        response = await _post(card["application_id"])

    assert response.status_code == 400
    generate.assert_not_awaited()


async def test_card_whose_job_is_gone_is_400(isolated_db: Any) -> None:
    card = await isolated_db.create_application(
        job_id="deleted-job", resume_id="deleted-resume", status="applied"
    )
    with patch(GENERATOR, new_callable=AsyncMock) as generate:
        response = await _post(card["application_id"])

    assert response.status_code == 400
    generate.assert_not_awaited()


async def test_oversized_job_description_is_422(isolated_db: Any) -> None:
    card = await _seed(isolated_db, job="x" * (MAX_JOB_CHARACTERS + 1))
    with patch(GENERATOR, new_callable=AsyncMock) as generate:
        response = await _post(card["application_id"])

    assert response.status_code == 422
    generate.assert_not_awaited()


async def test_generation_failure_is_a_generic_500(isolated_db: Any) -> None:
    card = await _seed(isolated_db)
    with patch(
        GENERATOR,
        new_callable=AsyncMock,
        side_effect=RuntimeError("provider said: key sk-secret-123 rejected"),
    ):
        response = await _post(card["application_id"])

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Failed to draft a follow-up email. Please try again."
    )
    assert "sk-secret" not in response.text


async def test_ai_timeout_is_504(isolated_db: Any) -> None:
    card = await _seed(isolated_db)
    with patch(
        GENERATOR,
        new_callable=AsyncMock,
        side_effect=AIOperationDeadlineExceeded("AI operation deadline exceeded"),
    ):
        response = await _post(card["application_id"])

    assert response.status_code == 504


async def test_failure_log_redacts_the_providers_secret(
    isolated_db: Any, caplog: pytest.LogCaptureFixture
) -> None:
    card = await _seed(isolated_db)
    with patch(
        GENERATOR,
        new_callable=AsyncMock,
        side_effect=RuntimeError(
            "provider said: key sk-secret-1234567890abcdef rejected"
        ),
    ):
        response = await _post(card["application_id"])

    assert response.status_code == 500
    logged = [
        r.getMessage() for r in caplog.records if r.name == "app.routers.applications"
    ]
    assert logged, "the failure was not logged"
    assert not any("sk-secret" in message for message in logged), logged


async def test_card_no_longer_waiting_on_a_reply_is_400(isolated_db: Any) -> None:
    card = await _seed(isolated_db)
    await isolated_db.update_application(
        card["application_id"], {"status": "interview"}
    )
    with patch(GENERATOR, new_callable=AsyncMock) as generate:
        response = await _post(card["application_id"])

    assert response.status_code == 400
    generate.assert_not_awaited()
