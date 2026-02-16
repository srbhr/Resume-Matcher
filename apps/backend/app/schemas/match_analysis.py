"""Pydantic models for dual-score JD match analysis."""

from pydantic import BaseModel, Field


class SynonymMatch(BaseModel):
    """A keyword match resolved through synonym normalization."""

    jd_term: str = Field(description="The term as it appears in the job description")
    resume_term: str = Field(description="The matching term found in the resume")
    canonical: str = Field(description="The canonical skill name both resolve to")


class ATSScoreResult(BaseModel):
    """Enhanced ATS keyword matching score with synonym support."""

    score: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Weighted ATS keyword score"
    )
    matched_keywords: list[str] = Field(
        default_factory=list, description="Keywords found in both JD and resume"
    )
    missing_keywords: list[str] = Field(
        default_factory=list, description="JD keywords not found in resume"
    )
    synonym_matches: list[SynonymMatch] = Field(
        default_factory=list,
        description="Keywords matched through synonym normalization",
    )
    total_keywords: int = Field(
        default=0, ge=0, description="Total unique keywords extracted from JD"
    )


class SectionScore(BaseModel):
    """Semantic similarity score for a single resume section."""

    section: str = Field(
        description="Resume section name (summary, experience, skills, education, projects)"
    )
    score: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Semantic similarity score"
    )


class SemanticScoreResult(BaseModel):
    """Semantic relevance score from sentence-transformer embeddings."""

    score: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Weighted semantic relevance score",
    )
    section_scores: list[SectionScore] = Field(
        default_factory=list,
        description="Per-section semantic similarity scores",
    )


class MatchAnalysisResponse(BaseModel):
    """Complete dual-score match analysis response."""

    ats_score: ATSScoreResult = Field(
        default_factory=ATSScoreResult,
        description="ATS keyword matching score with synonym support",
    )
    semantic_score: SemanticScoreResult = Field(
        default_factory=SemanticScoreResult,
        description="Semantic relevance score from embeddings",
    )
    combined_score: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Blended score: 0.5 * ats + 0.5 * semantic",
    )
