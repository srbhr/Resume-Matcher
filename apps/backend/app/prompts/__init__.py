"""Prompt validation helpers.

Prompt templates live under ``app.prompts.templates.<module>``; import them
directly from the appropriate submodule (e.g.
``from app.prompts.templates.resume import RESUME_PARSE_PROMPT``).
"""

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
    "REQUIRED_FEATURE_PROMPT_PLACEHOLDERS",
    "validate_prompt_placeholders",
]
