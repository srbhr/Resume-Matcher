"""Schemas for the conversational create-resume wizard."""

from typing import Any, Literal

from pydantic import BaseModel, Field

SectionKind = Literal["work", "education", "project", "skills", "summary"]


class DraftSectionRequest(BaseModel):
    """One section's worth of user answers to be authored into a fragment."""

    section: SectionKind
    answers: str = ""
    # Personalization / context (never AI-invented facts).
    name: str = ""
    role: str = ""
    # Assembled ResumeData so far — only consumed when section == "summary".
    resume_context: dict[str, Any] | None = None


class DraftSectionResponse(BaseModel):
    """A validated fragment the frontend merges into the running resume.

    ``data`` shape depends on ``section``:
      - work     -> a single Experience dict
      - education-> a single Education dict
      - project  -> a single Project dict
      - skills   -> {"technicalSkills": [str, ...]}
      - summary  -> {"summary": str}
    """

    request_id: str
    section: SectionKind
    data: dict[str, Any]


class WizardResumeCreate(BaseModel):
    """Persist the assembled resume as a (possibly master) resume."""

    processed_data: dict[str, Any] = Field(...)
    title: str | None = None
