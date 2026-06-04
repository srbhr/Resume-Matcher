"""Schemas for the adaptive one-question-at-a-time AI resume wizard."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.models import ResumeData

ResumeWizardSection = Literal[
    "intro",
    "contact",
    "summary",
    "workExperience",
    "internships",  # mapped onto workExperience by the service merge layer
    "education",
    "personalProjects",
    "skills",
    "review",
]

ResumeWizardStep = Literal["intro", "question", "review", "complete"]

ResumeWizardAction = Literal["start", "answer", "skip", "back", "review"]


class ResumeWizardQuestion(BaseModel):
    """A single question the wizard asks."""

    text: str = ""
    section: ResumeWizardSection = "intro"


class ResumeWizardProgress(BaseModel):
    """Server-computed progress for the question card's bar."""

    current: int = 0
    total: int = 8


class ResumeWizardAnswer(BaseModel):
    """User answer for one wizard turn."""

    text: str = Field(min_length=1, max_length=6000)

    @field_validator("text")
    @classmethod
    def _reject_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("answer text must not be blank")
        return value


class ResumeWizardHistoryEntry(BaseModel):
    """One answered question, with a pre-answer draft snapshot for Back."""

    question: str
    answer: str
    section: ResumeWizardSection
    resume_data_before: ResumeData


class ResumeWizardState(BaseModel):
    """Complete state that round-trips between client and server."""

    step: ResumeWizardStep = "intro"
    resume_data: ResumeData = Field(default_factory=ResumeData)
    current_question: ResumeWizardQuestion = Field(default_factory=ResumeWizardQuestion)
    history: list[ResumeWizardHistoryEntry] = Field(default_factory=list)
    asked_count: int = 0
    inferred_skills: list[str] = Field(default_factory=list)
    is_complete: bool = False
    progress: ResumeWizardProgress = Field(default_factory=ResumeWizardProgress)
    warnings: list[str] = Field(default_factory=list)


class ResumeWizardTurnRequest(BaseModel):
    """Request for one wizard turn."""

    state: ResumeWizardState
    action: ResumeWizardAction
    answer: ResumeWizardAnswer | None = None

    @model_validator(mode="after")
    def _validate_answer_present(self) -> "ResumeWizardTurnRequest":
        if self.action == "answer" and self.answer is None:
            raise ValueError("answer is required for answer actions")
        return self


class ResumeWizardTurnResponse(BaseModel):
    """Response for one wizard turn."""

    state: ResumeWizardState


class ResumeWizardFinalizeRequest(BaseModel):
    """Request to create the master resume from the wizard draft."""

    state: ResumeWizardState

    @model_validator(mode="after")
    def _validate_ready_to_finalize(self) -> "ResumeWizardFinalizeRequest":
        if not self.state.resume_data.personalInfo.name.strip():
            raise ValueError("personalInfo.name is required")
        return self


class ResumeWizardFinalizeResponse(BaseModel):
    """Response after creating the master resume."""

    message: str
    request_id: str
    resume_id: str
    processing_status: Literal["ready"] = "ready"
    is_master: bool
