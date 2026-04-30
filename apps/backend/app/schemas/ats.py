"""Pydantic schemas for ATS screening."""

from typing import Literal

from pydantic import BaseModel

from app.schemas.models import ResumeData


class ATSScreenRequest(BaseModel):
    """Request body for POST /api/v1/ats/screen."""

    resume_id: str | None = None
    resume_text: str | None = None
    job_id: str | None = None
    job_description: str | None = None
    save_optimized: bool = False


class ScoreBreakdown(BaseModel):
    """Weighted ATS score per dimension."""

    skills_match: float      # max 30
    experience_match: float  # max 25
    domain_match: float      # max 20
    tools_match: float       # max 15
    achievement_match: float # max 10
    total: float             # 0-100


class KeywordRow(BaseModel):
    """One row in the keyword match table."""

    keyword: str
    found_in_resume: bool
    section: str | None = None  # e.g. "workExperience", "summary", null if not found


class ATSScreeningResult(BaseModel):
    """Full ATS screening report returned by the endpoint."""

    score: ScoreBreakdown
    decision: Literal["PASS", "BORDERLINE", "REJECT"]
    keyword_table: list[KeywordRow]
    missing_keywords: list[str]
    warning_flags: list[str]           # >= 10 items when decision == "REJECT"
    optimization_suggestions: list[str]
    optimized_resume: ResumeData | None = None
    saved_resume_id: str | None = None  # populated when save_optimized=True


class ATSSaveResumeRequest(BaseModel):
    """Request body for POST /api/v1/ats/save-resume."""

    resume_data: ResumeData
    parent_id: str | None = None
    title: str = "ATS Optimized Resume"


class ATSSaveResumeResponse(BaseModel):
    """Response body for POST /api/v1/ats/save-resume."""

    resume_id: str
