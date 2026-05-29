"""Resume prompts: parsing, improvement (nudge/keywords/full), expansion/condensation."""

from app.prompts.templates.resume.full_tailor import RESUME_FULL_TAILOR_PROMPT
from app.prompts.templates.resume.improve import RESUME_IMPROVE_PROMPT
from app.prompts.templates.resume.nudge import RESUME_NUDGE_PROMPT
from app.prompts.templates.resume.util import (
    RESUME_CONDENSE_FROM_CV_PROMPT,
    RESUME_EXPAND_TO_CV_PROMPT,
    RESUME_PARSE_PROMPT,
    RESUME_SCHEMA_EXAMPLE,
)

RESUME_IMPROVE_OPTIONS = [
    {
        "id": "nudge",
        "label": "Light nudge",
        "description": "Minimal edits to better align existing experience.",
    },
    {
        "id": "keywords",
        "label": "Keyword enhance",
        "description": "Blend in relevant keywords without changing role or scope.",
    },
    {
        "id": "full",
        "label": "Full tailor",
        "description": "Comprehensive tailoring using the job description.",
    },
]

DEFAULT_RESUME_IMPROVE_PROMPT_ID = "keywords"

__all__ = [
    "DEFAULT_RESUME_IMPROVE_PROMPT_ID",
    "RESUME_CONDENSE_FROM_CV_PROMPT",
    "RESUME_EXPAND_TO_CV_PROMPT",
    "RESUME_FULL_TAILOR_PROMPT",
    "RESUME_IMPROVE_OPTIONS",
    "RESUME_IMPROVE_PROMPT",
    "RESUME_NUDGE_PROMPT",
    "RESUME_PARSE_PROMPT",
    "RESUME_SCHEMA_EXAMPLE",
]
