"""Integration tests for the adaptive resume wizard endpoints."""

import json
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.resume_wizard import ResumeWizardHistoryEntry, ResumeWizardQuestion
from app.services.resume_wizard import build_initial_wizard_state

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
    assert payload["resume_data"]["additional"]["technicalSkills"] == ["Python", "FastAPI"]
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


async def test_finalize_rejects_when_master_exists(isolated_db, sample_resume) -> None:
    await isolated_db.create_resume(
        content=json.dumps(sample_resume),
        content_type="json",
        filename="existing.json",
        is_master=True,
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
    assert "already exists" in response.json()["detail"].lower()


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
    state.current_question = ResumeWizardQuestion(text="Education?", section="education")

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
    assert payload["resume_data"]["education"] == []  # skip must not apply the model's data
    assert payload["asked_count"] == 1
