from uuid import UUID
from pydantic import BaseModel, Field


class MatchRequest(BaseModel):
    resume_id: UUID = Field(..., description="Resume UUID")
    job_id: UUID = Field(..., description="Job UUID")


class MatchBreakdown(BaseModel):
    skill_overlap: float
    keyword_coverage: float
    experience_relevance: float
    project_relevance: float
    education_bonus: float
    penalty_missing_critical: float
    # Optional: semantic component (0..1). Present when embeddings available.
    semantic_similarity: float | None = None
    raw_weighted_score: float
    normalized_score: float
    final_score: int
    weighted_positive: float
    weighted_penalty: float


class MatchCounts(BaseModel):
    resume_skills: int
    job_keywords: int
    experience_titles: int
    project_names: int
    required_qualifications: int


class MatchData(BaseModel):
    resume_id: str
    job_id: str
    score: int
    breakdown: MatchBreakdown
    counts: MatchCounts
    coverage: list[dict] | None = None


class MatchResponse(BaseModel):
    request_id: str
    data: MatchData
