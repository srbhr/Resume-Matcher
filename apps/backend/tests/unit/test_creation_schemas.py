"""Unit tests for the create-resume wizard schemas."""

import pytest
from pydantic import ValidationError

from app.schemas.creation import (
    DraftSectionRequest,
    DraftSectionResponse,
    WizardResumeCreate,
)


def test_draft_section_request_defaults():
    req = DraftSectionRequest(section="work", answers="backend eng at google, 2 yrs")
    assert req.section == "work"
    assert req.name == ""
    assert req.role == ""
    assert req.resume_context is None


def test_draft_section_request_rejects_unknown_section():
    with pytest.raises(ValidationError):
        DraftSectionRequest(section="hobbies", answers="x")


def test_draft_section_response_roundtrips_fragment():
    resp = DraftSectionResponse(
        request_id="r1", section="skills", data={"technicalSkills": ["Python"]}
    )
    assert resp.section == "skills"
    assert resp.data == {"technicalSkills": ["Python"]}


def test_wizard_resume_create_requires_processed_data():
    with pytest.raises(ValidationError):
        WizardResumeCreate()
    wc = WizardResumeCreate(processed_data={"personalInfo": {"name": "James"}})
    assert wc.processed_data["personalInfo"]["name"] == "James"
    assert wc.title is None
