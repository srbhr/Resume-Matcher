"""Writing-quality report models (no ResumeData dependency, so models.py can use them)."""

from typing import Literal

from pydantic import BaseModel, Field

WritingRule = Literal[
    "em_dash",
    "weak_opener",
    "no_outcome",
    "first_person",
    "ai_phrase",
    "repeated_opener",
    "long_bullet",
    "no_metric",
]


class WritingFinding(BaseModel):
    """One problem in one bullet (or the summary)."""

    path: str
    rule: WritingRule
    severity: Literal["hard", "soft"]
    excerpt: str = ""


class CriticNote(BaseModel):
    """The AI critic's note on one bullet."""

    path: str
    note: str


class WritingReport(BaseModel):
    """Writing quality of a resume. The score comes from the code rules only."""

    score: int | None = None
    before_score: int | None = None
    findings: list[WritingFinding] = Field(default_factory=list)
    critic_notes: list[CriticNote] = Field(default_factory=list)
    rewritten_paths: list[str] = Field(default_factory=list)
    rejected_rewrites: int = 0


class KeywordPlacement(BaseModel):
    keyword: str
    paths: list[str] = Field(default_factory=list)
