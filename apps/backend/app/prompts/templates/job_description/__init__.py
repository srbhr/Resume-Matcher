"""Prompts that extract information from a job description (title, keywords, skill targets)."""

from app.prompts.templates.job_description.keywords import (
    JOB_DESCRIPTION_EXTRACT_KEYWORDS_PROMPT,
)
from app.prompts.templates.job_description.skill import (
    JOB_DESCRIPTION_SKILL_TARGET_PROMPT,
)
from app.prompts.templates.job_description.title import JOB_DESCRIPTION_TITLE_PROMPT

__all__ = [
    "JOB_DESCRIPTION_EXTRACT_KEYWORDS_PROMPT",
    "JOB_DESCRIPTION_SKILL_TARGET_PROMPT",
    "JOB_DESCRIPTION_TITLE_PROMPT",
]
