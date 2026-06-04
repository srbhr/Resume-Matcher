"""Tests for the adaptive resume wizard schemas and service."""

import pytest
from pydantic import ValidationError

from app.schemas.resume_wizard import (
    ResumeWizardAnswer,
    ResumeWizardFinalizeRequest,
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
