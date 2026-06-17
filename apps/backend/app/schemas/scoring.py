"""Pydantic schemas for resume scoring endpoints."""

from pydantic import BaseModel


class ScoringPreferences(BaseModel):
    """Optional caller-supplied context injected into every scoring criterion.

    Free-text so callers can express any preference relevant to the specific
    job (relocation willingness, salary expectations, experience framing, etc.)
    without requiring schema changes per preference type.
    """

    context: str


class ScoreRequest(BaseModel):
    """Request body for creating a resume-job score."""

    resume_id: str
    job_id: str
    preferences: ScoringPreferences | None = None


class ScoreResult(BaseModel):
    """Response model for a resume-job match score."""

    score_id: str
    resume_id: str
    job_id: str
    score: int
    ai_score: int
    match_reasons: str
    red_flags: dict[str, list[str]]
    label: str
    color: str
    cached: bool
    created_at: str
