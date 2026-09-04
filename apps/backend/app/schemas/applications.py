"""Pydantic schemas for the Kanban application tracker."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


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


class TrackerColumnResponse(BaseModel):
    """A configured tracker column."""

    column_id: str
    label: str
    position: int
    is_system: bool
    is_hidden: bool
    created_at: str
    updated_at: str


class TrackerColumnCreate(BaseModel):
    """Create a custom tracker column."""

    label: str = Field(min_length=1, max_length=80)


class TrackerColumnUpdate(BaseModel):
    """Update a tracker column."""

    label: str | None = Field(default=None, min_length=1, max_length=80)
    position: int | None = Field(default=None, ge=0)
    is_hidden: bool | None = None


class TrackerColumnDelete(BaseModel):
    """Delete a custom column and move its cards elsewhere."""

    destination_id: str


class ApplicationResponse(BaseModel):
    """A single tracker card."""

    application_id: str
    job_id: str
    resume_id: str
    master_resume_id: str | None = None
    status: str
    company: str | None = None
    role: str | None = None
    applied_at: str | None = None
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


class ApplicationListResponse(BaseModel):
    """Applications grouped by column. All seven keys are always present."""

    columns: dict[str, list[ApplicationResponse]]
    column_definitions: list[TrackerColumnResponse] = Field(default_factory=list)


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
    status: str = ApplicationStatus.applied.value
    notes: str | None = None


class ApplicationUpdate(BaseModel):
    """Partial update — every field optional."""

    status: str | None = None
    position: int | None = None
    notes: str | None = None
    company: str | None = None
    role: str | None = None
    applied_at: str | None = None


class BulkStatusUpdate(BaseModel):
    """Move many cards to one column."""

    application_ids: list[str] = Field(min_length=1)
    status: str


class BulkDelete(BaseModel):
    """Delete many cards."""

    application_ids: list[str] = Field(min_length=1)


class ApplicationActionResponse(BaseModel):
    """Generic acknowledgement for bulk/destructive actions."""

    message: str
    affected: int
