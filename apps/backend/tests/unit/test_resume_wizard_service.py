"""Tests for the adaptive resume wizard schemas and service."""

import pytest
from pydantic import ValidationError

from app.schemas.resume_wizard import (
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
