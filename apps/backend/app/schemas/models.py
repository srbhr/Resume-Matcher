"""Pydantic models matching frontend expectations."""

from typing import Any

from pydantic import BaseModel, Field


# Resume Data Models (matching frontend types)
class PersonalInfo(BaseModel):
    """Personal information section."""

    fullName: str = ""
    title: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    website: str | None = None
    linkedin: str | None = None
    github: str | None = None


class Experience(BaseModel):
    """Work experience entry."""

    company: str = ""
    role: str = ""
    startYear: str = ""
    endYear: str = ""
    descriptions: list[str] = Field(default_factory=list)


class Education(BaseModel):
    """Education entry."""

    institution: str = ""
    degree: str = ""
    startYear: str = ""
    endYear: str = ""
    description: str | None = None


class Project(BaseModel):
    """Personal project entry."""

    name: str = ""
    role: str = ""
    startYear: str = ""
    endYear: str = ""
    descriptions: list[str] = Field(default_factory=list)


class AdditionalInfo(BaseModel):
    """Additional information section."""

    skills: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    awards: list[str] = Field(default_factory=list)


class ResumeData(BaseModel):
    """Complete structured resume data."""

    personalInfo: PersonalInfo = Field(default_factory=PersonalInfo)
    summary: str = ""
    workExperience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    personalProjects: list[Project] = Field(default_factory=list)
    additional: AdditionalInfo = Field(default_factory=AdditionalInfo)


# API Response Models
class ResumeUploadResponse(BaseModel):
    """Response for resume upload."""

    message: str
    request_id: str
    resume_id: str


class RawResume(BaseModel):
    """Raw resume data from database."""

    id: int | None = None
    content: str
    content_type: str = "md"
    created_at: str


class ResumeFetchData(BaseModel):
    """Data payload for resume fetch response."""

    resume_id: str
    raw_resume: RawResume
    processed_resume: ResumeData | None = None


class ResumeFetchResponse(BaseModel):
    """Response for resume fetch."""

    request_id: str
    data: ResumeFetchData


# Job Description Models
class JobUploadRequest(BaseModel):
    """Request to upload job descriptions."""

    job_descriptions: list[str]
    resume_id: str | None = None


class JobUploadResponse(BaseModel):
    """Response for job upload."""

    message: str
    job_id: list[str]
    request: dict[str, Any]


# Improvement Models
class ImproveResumeRequest(BaseModel):
    """Request to improve/tailor a resume."""

    resume_id: str
    job_id: str


class ImprovementSuggestion(BaseModel):
    """Single improvement suggestion."""

    suggestion: str
    lineNumber: int | None = None


class SkillComparison(BaseModel):
    """Skill gap analysis entry."""

    skill: str
    requiredLevel: str
    currentLevel: str
    gap: str


class ImproveResumeData(BaseModel):
    """Data payload for improve response."""

    request_id: str
    resume_id: str
    job_id: str
    original_score: int
    new_score: int
    resume_preview: ResumeData
    improvements: list[ImprovementSuggestion]
    skill_comparison: list[SkillComparison] = Field(default_factory=list)
    markdownOriginal: str | None = None
    markdownImproved: str | None = None


class ImproveResumeResponse(BaseModel):
    """Response for resume improvement."""

    request_id: str
    data: ImproveResumeData


# Config Models
class LLMConfigRequest(BaseModel):
    """Request to update LLM configuration."""

    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
    api_base: str | None = None


class LLMConfigResponse(BaseModel):
    """Response for LLM configuration."""

    provider: str
    model: str
    api_key: str  # Masked
    api_base: str | None = None


# Health/Status Models
class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    llm: dict[str, Any]


class StatusResponse(BaseModel):
    """Application status response."""

    status: str
    llm_configured: bool
    llm_healthy: bool
    has_master_resume: bool
    database_stats: dict[str, Any]
