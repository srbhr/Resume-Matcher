"""Pydantic models for multi-pass resume refinement."""

from pydantic import BaseModel, Field


class RefinementConfig(BaseModel):
    """Configuration for refinement passes."""

    enable_keyword_injection: bool = True
    enable_ai_phrase_removal: bool = True
    enable_master_alignment_check: bool = True
    max_refinement_passes: int = Field(default=2, ge=1, le=5)


class KeywordGapAnalysis(BaseModel):
    """Result of keyword gap analysis."""

    missing_keywords: list[str] = Field(default_factory=list)
    injectable_keywords: list[str] = Field(
        default_factory=list,
        description="Missing keywords that exist in master resume (safe to add)",
    )
    non_injectable_keywords: list[str] = Field(
        default_factory=list,
        description="Missing keywords not in master resume (cannot add truthfully)",
    )
    current_match_percentage: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Current keyword match percentage"
    )
    potential_match_percentage: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Potential match if injectable keywords are added",
    )


class AlignmentViolation(BaseModel):
    """Single alignment violation between tailored and master resume."""

    field_path: str = Field(description="Path to the violated field in resume data")
    violation_type: str = Field(
        description="Type: fabricated_skill, fabricated_cert, fabricated_company, invented_content"
    )
    value: str = Field(description="The violating value")
    severity: str = Field(
        default="warning", description="Severity: critical or warning"
    )


class AlignmentReport(BaseModel):
    """Master resume alignment validation result."""

    is_aligned: bool = Field(
        default=True, description="True if no critical violations found"
    )
    violations: list[AlignmentViolation] = Field(default_factory=list)
    confidence_score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Alignment confidence (1.0 = perfect alignment)",
    )


class RefinementStats(BaseModel):
    """Statistics from the refinement process for API responses."""

    passes_completed: int = Field(default=0, ge=0, description="Number of passes run")
    keywords_injected: int = Field(
        default=0, ge=0, description="Number of keywords injected"
    )
    ai_phrases_removed: list[str] = Field(
        default_factory=list, description="List of AI phrases that were removed"
    )
    alignment_violations_fixed: int = Field(
        default=0, ge=0, description="Number of alignment violations corrected"
    )
    initial_match_percentage: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Keyword match before refinement",
    )
    final_match_percentage: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Keyword match after refinement"
    )


class RefinementResult(BaseModel):
    """Complete result from the refinement process."""

    refined_data: dict = Field(
        default_factory=dict, description="The refined resume data"
    )
    passes_completed: int = Field(default=0, ge=0)
    keyword_analysis: KeywordGapAnalysis | None = None
    alignment_report: AlignmentReport | None = None
    ai_phrases_removed: list[str] = Field(default_factory=list)
    final_match_percentage: float = Field(default=0.0, ge=0.0, le=100.0)

    def to_stats(self, initial_match: float = 0.0) -> RefinementStats:
        """Convert to RefinementStats for API response."""
        return RefinementStats(
            passes_completed=self.passes_completed,
            keywords_injected=(
                len(self.keyword_analysis.injectable_keywords)
                if self.keyword_analysis and self.keyword_analysis.injectable_keywords
                else 0
            ),
            ai_phrases_removed=self.ai_phrases_removed,
            alignment_violations_fixed=(
                len(
                    [
                        v
                        for v in self.alignment_report.violations
                        if v.severity == "critical"
                    ]
                )
                if self.alignment_report and self.alignment_report.violations
                else 0
            ),
            initial_match_percentage=initial_match,
            final_match_percentage=self.final_match_percentage,
        )
