"""LLM prompt templates."""

from app.prompts.templates import (
    CRITICAL_TRUTHFULNESS_RULES,
    DEFAULT_IMPROVE_PROMPT_ID,
    DIFF_IMPROVE_PROMPT,
    DIFF_STRATEGY_INSTRUCTIONS,
    EXTRACT_KEYWORDS_PROMPT,
    GENERATE_TITLE_PROMPT,
    IMPROVE_PROMPT_OPTIONS,
    IMPROVE_RESUME_PROMPT,
    IMPROVE_RESUME_PROMPTS,
    PARSE_RESUME_PROMPT,
    SKILL_TARGET_PLAN_PROMPT,
    get_language_name,
)

# Placeholders every user-supplied cover-letter / outreach prompt must contain.
# These correspond to the ``.format()`` keys used by the services in
# ``app/services/cover_letter.py``. Validated at save time so a 422 surfaces
# immediately instead of a ``KeyError`` during generation.
REQUIRED_FEATURE_PROMPT_PLACEHOLDERS: tuple[str, ...] = (
    "{job_description}",
    "{resume_data}",
    "{output_language}",
)


def validate_prompt_placeholders(prompt: str) -> list[str]:
    """Return required placeholders missing from ``prompt``.

    Empty or whitespace-only prompts are treated as "use default" and return
    an empty list (valid — the router treats them as clearing the override).
    Non-empty prompts must include every entry from
    ``REQUIRED_FEATURE_PROMPT_PLACEHOLDERS``.
    """
    if not prompt or not prompt.strip():
        return []
    return [p for p in REQUIRED_FEATURE_PROMPT_PLACEHOLDERS if p not in prompt]


__all__ = [
    "PARSE_RESUME_PROMPT",
    "EXTRACT_KEYWORDS_PROMPT",
    "IMPROVE_RESUME_PROMPT",
    "IMPROVE_RESUME_PROMPTS",
    "IMPROVE_PROMPT_OPTIONS",
    "DEFAULT_IMPROVE_PROMPT_ID",
    "CRITICAL_TRUTHFULNESS_RULES",
    "DIFF_IMPROVE_PROMPT",
    "DIFF_STRATEGY_INSTRUCTIONS",
    "SKILL_TARGET_PLAN_PROMPT",
    "GENERATE_TITLE_PROMPT",
    "REQUIRED_FEATURE_PROMPT_PLACEHOLDERS",
    "validate_prompt_placeholders",
    "get_language_name",
]
