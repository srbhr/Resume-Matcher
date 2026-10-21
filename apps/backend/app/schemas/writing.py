"""Schemas for the writing-quality critique, the rewrite loop and keyword forcing."""

from pydantic import BaseModel, Field

from app.schemas.models import ResumeData
from app.schemas.writing_report import (
    CriticNote,
    KeywordPlacement,
    WritingFinding,
    WritingReport,
    WritingRule,
)

__all__ = [
    "ApplyKeywordsRequest",
    "CriticNote",
    "ForcedKeyword",
    "KeywordPlacement",
    "WritingChange",
    "WritingCheckRequest",
    "WritingFinding",
    "WritingImproveRequest",
    "WritingImproveResponse",
    "WritingReport",
    "WritingRule",
]


class WritingCheckRequest(BaseModel):
    resume_data: ResumeData


class WritingImproveRequest(BaseModel):
    resume_data: ResumeData
    progress_id: str | None = Field(default=None, max_length=64)


class WritingChange(BaseModel):
    path: str
    before: str
    after: str


class WritingImproveResponse(BaseModel):
    improved_data: ResumeData
    writing: WritingReport
    changes: list[WritingChange] = Field(default_factory=list)


class ForcedKeyword(BaseModel):
    keyword: str = Field(min_length=1, max_length=80)
    # True when the user confirmed "I have this" for a keyword the master lacks.
    attested: bool = False


class ApplyKeywordsRequest(BaseModel):
    resume_id: str
    job_id: str
    preview_id: str
    improved_data: ResumeData
    keywords: list[ForcedKeyword] = Field(min_length=1, max_length=30)
    prompt_id: str | None = None
