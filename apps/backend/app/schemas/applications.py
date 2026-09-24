"""Pydantic schemas for the Kanban application tracker."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator
from pydantic.json_schema import SkipJsonSchema


class ApplicationStatus(str, Enum):
    """The seven stable tracker columns (decoupled from i18n labels)."""

    saved = "saved"
    applied = "applied"
    no_response = "no_response"
    response = "response"
    interview = "interview"
    accepted = "accepted"
    rejected = "rejected"


# Order the board renders columns in.
APPLICATION_STATUS_ORDER: list[str] = [s.value for s in ApplicationStatus]


class ApplicationResponse(BaseModel):
    """A single tracker card."""

    application_id: str
    job_id: str
    resume_id: str
    master_resume_id: str | None = None
    status: ApplicationStatus
    company: str | None = None
    role: str | None = None
    applied_at: str | None = None
    interview_times: list[str] = Field(default_factory=list)
    notes: str | None = None
    position: int
    created_at: str
    updated_at: str


class ApplicationDetailResponse(ApplicationResponse):
    """A card plus the embedded job description and applied resume.

    ``resume`` is null when the referenced resume has been deleted — the modal
    renders "resume unavailable" rather than 500ing.
    """

    job_content: str | None = None
    resume: dict[str, Any] | None = None
    interview_questions: list["ApplicationInterviewQuestionResponse"] = Field(
        default_factory=list
    )


class ApplicationListResponse(BaseModel):
    """Applications grouped by column. All seven keys are always present."""

    columns: dict[str, list[ApplicationResponse]]


class ApplicationInterviewQuestionCreate(BaseModel):
    """A manually entered interview question."""

    question: str = Field(min_length=1)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        """Reject whitespace-only questions and store the trimmed text."""
        question = value.strip()
        if not question:
            raise ValueError("Question cannot be blank")
        return question


class ApplicationInterviewQuestionResponse(BaseModel):
    """An interview question plus the live tracker-card context."""

    question_id: str
    application_id: str
    question: str
    company: str | None = None
    role: str | None = None


class ApplicationInterviewQuestionListResponse(BaseModel):
    """All recorded interview questions across every application."""

    questions: list[ApplicationInterviewQuestionResponse]


class ManualApplicationCreate(BaseModel):
    """Create a card from a pasted JD (no prior tailoring).

    The router creates the job from ``job_description`` then the application.
    ``company``/``role`` are optional overrides; when omitted the router runs a
    best-effort extraction.
    """

    resume_id: str
    job_description: str = Field(min_length=1)
    company: str | None = None
    role: str | None = None
    status: ApplicationStatus = ApplicationStatus.applied
    notes: str | None = None


class ApplicationUpdate(BaseModel):
    """Partial update — every field optional."""

    status: ApplicationStatus | SkipJsonSchema[None] = None
    position: int | None = None
    notes: str | None = None
    company: str | None = None
    role: str | None = None
    applied_at: str | None = None
    interview_times: list[str] | None = None

    @field_validator("status")
    @classmethod
    def reject_null_status(cls, value: ApplicationStatus | None) -> ApplicationStatus:
        """Omission preserves status; an explicitly supplied null is invalid."""
        if value is None:
            raise ValueError("Status cannot be null")
        return value

    @field_validator("interview_times")
    @classmethod
    def validate_interview_times(cls, values: list[str] | None) -> list[str] | None:
        """Validate and normalize wall-clock ``datetime-local`` values."""
        if values is None:
            return None
        normalized: list[str] = []
        for value in values:
            if not isinstance(value, str) or "T" not in value:
                raise ValueError("Interview times must include a local date and time")
            try:
                parsed = datetime.fromisoformat(value)
            except ValueError as exc:
                raise ValueError("Interview times must be valid local date-times") from exc
            if parsed.tzinfo is not None:
                raise ValueError("Interview times must not include a timezone")
            normalized.append(
                parsed.replace(second=0, microsecond=0).isoformat(timespec="minutes")
            )
        return normalized


class BulkStatusUpdate(BaseModel):
    """Move many cards to one column."""

    application_ids: list[str] = Field(min_length=1)
    status: ApplicationStatus


class BulkDelete(BaseModel):
    """Delete many cards."""

    application_ids: list[str] = Field(min_length=1)


class ApplicationActionResponse(BaseModel):
    """Generic acknowledgement for bulk/destructive actions."""

    message: str
    affected: int
