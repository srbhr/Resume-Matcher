"""Integration tests for the adaptive resume wizard endpoints."""

import asyncio
import json
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import MAX_MASTER_RESUMES, Database
from app.main import app
from app.schemas.resume_wizard import ResumeWizardHistoryEntry, ResumeWizardQuestion
from app.services.resume_wizard import (
    RESUME_WIZARD_MAX_QUESTIONS,
    build_initial_wizard_state,
)

_AI_RESULT = {
    "resume_data": {
        "personalInfo": {"name": "James"},
        "summary": "",
        "workExperience": [],
        "education": [],
        "personalProjects": [],
        "additional": {
            "technicalSkills": ["Python"],
            "languages": [],
            "certificationsTraining": [],
            "awards": [],
        },
        "sectionMeta": [],
        "customSections": {},
    },
    "next_question": {"text": "What tools do you use most?", "section": "skills"},
    "inferred_skills": ["FastAPI"],
    "is_complete": False,
}


async def test_turn_answer_runs_ai_and_returns_next_question(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.step = "question"
    state.current_question.section = "skills"

    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=_AI_RESULT,
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/resume-wizard/turn",
                json={
                    "state": state.model_dump(mode="json"),
                    "action": "answer",
                    "answer": {"text": "I use Python and FastAPI."},
                },
            )

    assert response.status_code == 200
    payload = response.json()["state"]
    assert payload["current_question"]["text"] == "What tools do you use most?"
    assert payload["resume_data"]["additional"]["technicalSkills"] == [
        "Python",
        "FastAPI",
    ]
    assert payload["asked_count"] == 1


async def test_turn_review_needs_no_llm(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.step = "question"
    state.resume_data.personalInfo.name = "James"

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/turn",
            json={"state": state.model_dump(mode="json"), "action": "review"},
        )

    assert response.status_code == 200
    payload = response.json()["state"]
    assert payload["step"] == "review"
    assert payload["warnings"]


async def test_turn_answer_without_answer_is_422(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/turn",
            json={"state": state.model_dump(mode="json"), "action": "answer"},
        )
    assert response.status_code == 422


async def test_turn_malformed_model_envelope_is_recoverable_422(
    isolated_db: Database,
) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.step = "question"
    state.current_question = ResumeWizardQuestion(
        text="Experience?", section="workExperience"
    )

    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value={"is_complete": "false"},
    ) as mock_complete:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/resume-wizard/turn",
                json={
                    "state": state.model_dump(mode="json"),
                    "action": "answer",
                    "answer": {"text": "Engineer at Acme"},
                },
            )

    assert response.status_code == 422
    assert response.json() == {"detail": "Could not update the resume draft."}
    assert mock_complete.await_count == 1


async def test_finalize_creates_ready_master_resume(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.resume_data.personalInfo.name = "James"
    state.resume_data.personalInfo.email = "james@example.com"
    state.resume_data.additional.technicalSkills = ["Python"]

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/finalize",
            json={"state": state.model_dump(mode="json")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["processing_status"] == "ready"
    assert payload["is_master"] is True

    stored = await isolated_db.get_resume(payload["resume_id"])
    assert stored is not None
    assert stored["is_master"] is True
    assert stored["content_type"] == "json"
    assert json.loads(stored["content"])["personalInfo"]["name"] == "James"


async def test_finalize_replays_identical_wizard_master_without_duplication(
    isolated_db: Database,
) -> None:
    state = build_initial_wizard_state()
    state.resume_data.personalInfo.name = "James"
    request = {"state": state.model_dump(mode="json")}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post("/api/v1/resume-wizard/finalize", json=request)
        replay = await client.post("/api/v1/resume-wizard/finalize", json=request)

    assert first.status_code == 200
    assert replay.status_code == 200
    assert replay.json()["resume_id"] == first.json()["resume_id"]
    assert len(await isolated_db.list_resumes()) == 1


async def test_concurrent_identical_finalizes_create_one_master(
    isolated_db: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A double-submit must replay, not consume two master slots (spec §4.2)."""
    state = build_initial_wizard_state()
    state.resume_data.personalInfo.name = "James"
    request = {"state": state.model_dump(mode="json")}
    create_master = isolated_db.create_resume_atomic_master
    arrived = 0
    both_arrived = asyncio.Event()

    async def create_after_both_requests_arrive(
        *args: Any, **kwargs: Any
    ) -> dict[str, Any]:
        # Force the overlap a double-submit produces: hold each finalize at the
        # create_resume_atomic_master call until both reach it, so both creates run
        # at once. replay_if runs inside that call's BEGIN IMMEDIATE transaction, so
        # the request that gets the writer second waits (busy_timeout) and its
        # replay check sees the first one's committed row instead of inserting.
        nonlocal arrived
        arrived += 1
        if arrived == 2:
            both_arrived.set()
        try:
            await asyncio.wait_for(both_arrived.wait(), timeout=5)
        except TimeoutError:
            pass
        return await create_master(*args, **kwargs)

    monkeypatch.setattr(
        isolated_db, "create_resume_atomic_master", create_after_both_requests_arrive
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first, second = await asyncio.gather(
            client.post("/api/v1/resume-wizard/finalize", json=request),
            client.post("/api/v1/resume-wizard/finalize", json=request),
        )

    assert arrived == 2  # the barrier really held both requests
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["resume_id"] == second.json()["resume_id"]
    masters = await isolated_db.list_master_resumes()
    assert [m["resume_id"] for m in masters] == [first.json()["resume_id"]]


async def test_identical_finalize_replays_even_at_the_master_limit(
    isolated_db: Database, sample_resume: dict[str, Any]
) -> None:
    state = build_initial_wizard_state()
    state.resume_data.personalInfo.name = "James"
    request = {"state": state.model_dump(mode="json")}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post("/api/v1/resume-wizard/finalize", json=request)
        for i in range(MAX_MASTER_RESUMES - 1):
            await isolated_db.create_resume_atomic_master(
                content=json.dumps(sample_resume),
                content_type="json",
                filename=f"existing-{i}.json",
                processed_data=sample_resume,
                processing_status="ready",
            )
        replay = await client.post("/api/v1/resume-wizard/finalize", json=request)

    assert replay.status_code == 200, replay.text
    assert replay.json()["resume_id"] == first.json()["resume_id"]
    assert len(await isolated_db.list_master_resumes()) == MAX_MASTER_RESUMES


async def test_finalize_different_draft_creates_second_master(
    isolated_db: Database,
) -> None:
    first_state = build_initial_wizard_state()
    first_state.resume_data.personalInfo.name = "James"
    changed_state = first_state.model_copy(deep=True)
    changed_state.resume_data.summary = "A different draft"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post(
            "/api/v1/resume-wizard/finalize",
            json={"state": first_state.model_dump(mode="json")},
        )
        second = await client.post(
            "/api/v1/resume-wizard/finalize",
            json={"state": changed_state.model_dump(mode="json")},
        )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["resume_id"] != first.json()["resume_id"]
    assert len(await isolated_db.list_master_resumes()) == 2


async def test_finalize_creates_additional_master_when_one_exists(
    isolated_db: Database, sample_resume: dict[str, Any]
) -> None:
    existing = await isolated_db.create_resume_atomic_master(
        content=json.dumps(sample_resume),
        content_type="json",
        filename="existing.json",
        processed_data=sample_resume,
        processing_status="ready",
    )
    state = build_initial_wizard_state()
    state.resume_data.personalInfo.name = "James"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/finalize",
            json={"state": state.model_dump(mode="json")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_master"] is True
    assert payload["is_default_master"] is False
    assert payload["resume_id"] != existing["resume_id"]
    assert (await isolated_db.get_master_resume())["resume_id"] == existing["resume_id"]


async def test_finalize_rejects_at_master_limit(
    isolated_db: Database, sample_resume: dict[str, Any]
) -> None:
    for i in range(MAX_MASTER_RESUMES):
        await isolated_db.create_resume_atomic_master(
            content=json.dumps(sample_resume),
            content_type="json",
            filename=f"existing-{i}.json",
            processed_data=sample_resume,
            processing_status="ready",
        )
    state = build_initial_wizard_state()
    state.resume_data.personalInfo.name = "James"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/finalize",
            json={"state": state.model_dump(mode="json")},
        )

    assert response.status_code == 409
    assert "up to 5 master resumes" in response.json()["detail"]
    assert len(await isolated_db.list_master_resumes()) == MAX_MASTER_RESUMES


async def test_turn_start_returns_initial_state(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/turn",
            json={"state": state.model_dump(mode="json"), "action": "start"},
        )

    assert response.status_code == 200
    payload = response.json()["state"]
    assert payload["step"] == "intro"
    assert payload["current_question"]["section"] == "intro"
    assert payload["asked_count"] == 0


async def test_turn_back_restores_previous_question(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.step = "question"
    state.asked_count = 1
    state.current_question = ResumeWizardQuestion(text="Skills?", section="skills")
    state.resume_data.additional.technicalSkills = ["Python"]
    state.history = [
        ResumeWizardHistoryEntry(
            question="Where have you worked?",
            answer="Acme",
            section="workExperience",
            resume_data_before=build_initial_wizard_state().resume_data,
        )
    ]

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/turn",
            json={"state": state.model_dump(mode="json"), "action": "back"},
        )

    assert response.status_code == 200
    payload = response.json()["state"]
    assert payload["asked_count"] == 0
    assert payload["current_question"]["section"] == "workExperience"
    # The pre-answer snapshot is restored, dropping the later skills edit.
    assert payload["resume_data"]["additional"]["technicalSkills"] == []


async def test_turn_skip_advances_without_modifying_resume_data(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.step = "question"
    state.current_question = ResumeWizardQuestion(
        text="Education?", section="education"
    )

    skip_result = {
        "resume_data": {"education": [{"id": 1, "institution": "MIT"}]},
        "next_question": {"text": "What skills?", "section": "skills"},
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=skip_result,
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/resume-wizard/turn",
                json={"state": state.model_dump(mode="json"), "action": "skip"},
            )

    assert response.status_code == 200
    payload = response.json()["state"]
    assert payload["current_question"]["section"] == "skills"
    assert (
        payload["resume_data"]["education"] == []
    )  # skip must not apply the model's data
    assert payload["asked_count"] == 1


async def test_turn_answer_past_cap_routes_to_review_without_llm(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.step = "question"
    state.current_question.section = "skills"
    state.asked_count = RESUME_WIZARD_MAX_QUESTIONS  # at the cap

    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
    ) as mock_complete:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/resume-wizard/turn",
                json={
                    "state": state.model_dump(mode="json"),
                    "action": "answer",
                    "answer": {"text": "one more thing"},
                },
            )

    assert response.status_code == 200
    assert response.json()["state"]["step"] == "review"
    mock_complete.assert_not_awaited()  # cap guard must skip the LLM call
