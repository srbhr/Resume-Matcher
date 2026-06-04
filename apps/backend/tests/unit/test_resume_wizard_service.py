"""Tests for the adaptive resume wizard schemas and service."""

import pytest
from pydantic import ValidationError

from app.schemas.resume_wizard import (
    ResumeWizardAnswer,
    ResumeWizardFinalizeRequest,
    ResumeWizardHistoryEntry,
    ResumeWizardQuestion,
    ResumeWizardState,
    ResumeWizardTurnRequest,
)


def test_initial_state_defaults_to_intro() -> None:
    state = ResumeWizardState()
    assert state.step == "intro"
    assert state.current_question.section == "intro"
    assert state.resume_data.personalInfo.name == ""
    assert state.history == []
    assert state.asked_count == 0
    assert state.progress.total == 8


def test_turn_request_requires_answer_for_answer_action() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardTurnRequest(state=ResumeWizardState(), action="answer", answer=None)


def test_turn_request_skip_needs_no_answer() -> None:
    request = ResumeWizardTurnRequest(state=ResumeWizardState(), action="skip")
    assert request.action == "skip"
    assert request.answer is None


def test_question_rejects_unknown_section() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardQuestion(text="Hi", section="not-a-section")


def test_finalize_requires_non_empty_name() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardFinalizeRequest(state=ResumeWizardState())


def test_answer_rejects_empty_text() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardAnswer(text="")


def test_answer_rejects_text_over_6000_chars() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardAnswer(text="x" * 6001)


from app.schemas.models import ResumeData
from app.services.resume_wizard import (
    RESUME_WIZARD_MAX_QUESTIONS,
    build_initial_wizard_state,
    build_review_warnings,
    compute_progress,
    extract_intro_name,
    merge_unique_skills,
    section_prompt,
)


def test_build_initial_state_has_intro_question() -> None:
    state = build_initial_wizard_state()
    assert state.step == "intro"
    assert state.current_question.section == "intro"
    assert state.current_question.text.startswith("Hi")


def test_extract_intro_name_from_conversational_answer() -> None:
    assert extract_intro_name("Hi, I'm James and I want product roles") == "James"
    assert extract_intro_name("My name is Priya Sharma") == "Priya Sharma"
    assert extract_intro_name("just looking around") == ""


def test_merge_unique_skills_dedupes_case_insensitively_and_keeps_order() -> None:
    assert merge_unique_skills(["Python", "React"], ["python", "FastAPI"]) == [
        "Python",
        "React",
        "FastAPI",
    ]


def test_section_prompt_falls_back_for_unknown_section() -> None:
    assert section_prompt("workExperience").lower().startswith("tell me about one role")
    assert section_prompt("totally-unknown") == "What would you like to add next?"


def test_compute_progress_grows_with_questions_and_caps() -> None:
    early = compute_progress(asked_count=2, is_complete=False)
    assert early.current == 2
    assert early.total == 8
    growing = compute_progress(asked_count=7, is_complete=False)
    assert growing.current == 7
    assert growing.total == 9  # asked + 2 = 9 grows past the baseline of 8
    capped = compute_progress(asked_count=RESUME_WIZARD_MAX_QUESTIONS, is_complete=True)
    assert capped.total == RESUME_WIZARD_MAX_QUESTIONS
    assert capped.current == RESUME_WIZARD_MAX_QUESTIONS


def test_review_warnings_identify_thin_resume() -> None:
    data = ResumeData()
    data.personalInfo.name = "James"
    warnings = build_review_warnings(data)
    assert any("contact" in w.lower() for w in warnings)
    assert any("experience" in w.lower() for w in warnings)
    assert any("skills" in w.lower() for w in warnings)
    # Name is set, so there must be NO name warning.
    assert not any("name" in w.lower() for w in warnings)


def test_review_warnings_flag_missing_name() -> None:
    data = ResumeData()  # name is empty
    warnings = build_review_warnings(data)
    assert any("name" in w.lower() for w in warnings)


from unittest.mock import AsyncMock, patch

from app.services.resume_wizard import (
    apply_back,
    apply_review,
    run_ai_turn,
)

_AI_EXPERIENCE_RESULT = {
    "resume_data": {
        "personalInfo": {"name": "James"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "title": "Engineer",
                "company": "Acme",
                "years": "2021 - Present",
                "description": ["Shipped the billing service"],
            }
        ],
        "education": [],
        "personalProjects": [],
        "additional": {
            "technicalSkills": [],
            "languages": [],
            "certificationsTraining": [],
            "awards": [],
        },
        "sectionMeta": [],
        "customSections": {},
    },
    "next_question": {"text": "What did you build at Acme?", "section": "workExperience"},
    "inferred_skills": ["Python"],
    "is_complete": False,
}


def _state_on_section(section: str) -> ResumeWizardState:
    state = build_initial_wizard_state()
    state.step = "question"
    state.current_question = ResumeWizardQuestion(text="?", section=section)
    return state


async def test_ai_turn_merges_only_target_section_and_advances() -> None:
    state = _state_on_section("workExperience")
    state.resume_data.personalInfo.name = "James"
    state.resume_data.education = []

    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=_AI_EXPERIENCE_RESULT,
    ):
        result = await run_ai_turn(state, "I was an engineer at Acme", skip=False)

    assert len(result.resume_data.workExperience) == 1
    assert result.resume_data.workExperience[0].company == "Acme"
    assert result.current_question.text == "What did you build at Acme?"
    assert result.asked_count == 1
    assert result.inferred_skills == ["Python"]
    assert len(result.history) == 1
    assert result.history[0].section == "workExperience"


async def test_ai_turn_does_not_let_other_sections_be_clobbered() -> None:
    state = _state_on_section("skills")
    state.resume_data.workExperience = []
    existing = {
        "id": 9,
        "title": "PM",
        "company": "Globex",
        "years": "2019 - 2021",
        "description": ["Ran the roadmap"],
    }
    state.resume_data = ResumeData.model_validate(
        {"workExperience": [existing], "additional": {"technicalSkills": ["SQL"]}}
    )

    skills_result = {
        "resume_data": {
            "workExperience": [],  # model wrongly clears experience
            "additional": {"technicalSkills": ["Python"]},
        },
        "next_question": {"text": "Anything else?", "section": "review"},
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=skills_result,
    ):
        result = await run_ai_turn(state, "I use Python", skip=False)

    # Experience preserved; skills merged (case-insensitive, order-preserving).
    assert len(result.resume_data.workExperience) == 1
    assert result.resume_data.additional.technicalSkills == ["SQL", "Python"]


async def test_ai_turn_question_cap_forces_completion() -> None:
    state = _state_on_section("workExperience")
    state.asked_count = RESUME_WIZARD_MAX_QUESTIONS - 1

    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=_AI_EXPERIENCE_RESULT,  # is_complete False from model
    ):
        result = await run_ai_turn(state, "more detail", skip=False)

    assert result.asked_count == RESUME_WIZARD_MAX_QUESTIONS
    assert result.is_complete is True


async def test_ai_turn_skip_does_not_modify_resume_data() -> None:
    state = _state_on_section("education")
    before = state.resume_data.model_dump()

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
        result = await run_ai_turn(state, "", skip=True)

    assert result.resume_data.model_dump() == before
    assert result.current_question.section == "skills"
    assert result.history[0].answer == ""


async def test_ai_turn_intro_uses_deterministic_name_fallback() -> None:
    state = build_initial_wizard_state()  # section intro
    result_without_name = {
        "resume_data": {"personalInfo": {"title": "Engineer"}},
        "next_question": {"text": "Where have you worked?", "section": "workExperience"},
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=result_without_name,
    ):
        result = await run_ai_turn(state, "Hi, I'm Priya, after backend roles", skip=False)

    assert result.resume_data.personalInfo.name == "Priya"


async def test_ai_turn_missing_next_question_falls_back_to_gap() -> None:
    state = _state_on_section("workExperience")
    bad_result = {
        "resume_data": _AI_EXPERIENCE_RESULT["resume_data"],
        "next_question": None,
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=bad_result,
    ):
        result = await run_ai_turn(state, "engineer at Acme", skip=False)

    # workExperience now filled -> next gap is education.
    assert result.current_question.section == "education"


def test_apply_back_restores_previous_snapshot() -> None:
    state = _state_on_section("skills")
    state.asked_count = 2
    before = ResumeData()
    before.personalInfo.name = "James"
    state.history = [
        ResumeWizardHistoryEntry(
            question="Where have you worked?",
            answer="Acme",
            section="workExperience",
            resume_data_before=before,
        )
    ]
    state.resume_data.additional.technicalSkills = ["Python"]

    result = apply_back(state)

    assert result.asked_count == 1
    assert result.current_question.section == "workExperience"
    assert result.resume_data.additional.technicalSkills == []
    assert result.resume_data.personalInfo.name == "James"
    assert result.history == []


def test_apply_back_noop_without_history() -> None:
    state = build_initial_wizard_state()
    result = apply_back(state)
    assert result.step == "intro"
    assert result.asked_count == 0


def test_apply_review_builds_warnings_without_llm() -> None:
    state = _state_on_section("skills")
    state.resume_data.personalInfo.name = "James"
    result = apply_review(state)
    assert result.step == "review"
    assert result.current_question.section == "review"
    assert result.warnings  # thin resume -> at least one note


_GLOBEX_ROLE = {
    "id": 1,
    "title": "PM",
    "company": "Globex",
    "years": "2019 - 2021",
    "description": ["Ran the roadmap"],
}
_ACME_ROLE = {
    "id": 2,
    "title": "Engineer",
    "company": "Acme",
    "years": "2021 - Present",
    "description": ["Shipped billing"],
}


async def test_ai_turn_full_echo_keeps_all_experience_in_order() -> None:
    # Model echoes the FULL list (existing + new) — both must survive, in order.
    state = _state_on_section("workExperience")
    state.resume_data = ResumeData.model_validate({"workExperience": [_GLOBEX_ROLE]})

    full_echo = {
        "resume_data": {"workExperience": [_GLOBEX_ROLE, _ACME_ROLE]},
        "next_question": {"text": "More roles?", "section": "workExperience"},
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=full_echo,
    ):
        result = await run_ai_turn(state, "I also worked at Acme", skip=False)

    assert [e.company for e in result.resume_data.workExperience] == ["Globex", "Acme"]


async def test_ai_turn_partial_echo_does_not_drop_prior_experience() -> None:
    # Model returns ONLY the new role (a common mis-read) — prior role must NOT be lost.
    state = _state_on_section("workExperience")
    state.resume_data = ResumeData.model_validate({"workExperience": [_GLOBEX_ROLE]})

    partial = {
        "resume_data": {"workExperience": [_ACME_ROLE]},
        "next_question": {"text": "More roles?", "section": "workExperience"},
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=partial,
    ):
        result = await run_ai_turn(state, "I also worked at Acme", skip=False)

    assert {e.company for e in result.resume_data.workExperience} == {"Globex", "Acme"}
