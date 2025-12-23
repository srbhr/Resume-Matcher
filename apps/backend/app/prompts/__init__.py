"""LLM prompt templates."""

from app.prompts.templates import (
    EXTRACT_KEYWORDS_PROMPT,
    IMPROVE_RESUME_PROMPT,
    PARSE_RESUME_PROMPT,
    SCORE_RESUME_PROMPT,
)

__all__ = [
    "PARSE_RESUME_PROMPT",
    "EXTRACT_KEYWORDS_PROMPT",
    "SCORE_RESUME_PROMPT",
    "IMPROVE_RESUME_PROMPT",
]
