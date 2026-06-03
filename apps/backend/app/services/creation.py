"""Author one ResumeData fragment per section from the user's plain answers.

Stateless. Mirrors the enrichment service: one ``complete_json`` call, the
result validated against the canonical ``ResumeData`` sub-schemas before it is
handed back. User answers are sanitized for prompt-injection first.
"""

import json
import logging
from typing import Any

from app.config_cache import get_content_language
from app.llm import complete_json
from app.prompts.creation import (
    DRAFT_EDUCATION_PROMPT,
    DRAFT_PROJECT_PROMPT,
    DRAFT_SKILLS_PROMPT,
    DRAFT_SUMMARY_PROMPT,
    DRAFT_WORK_PROMPT,
)
from app.prompts.templates import get_language_name
from app.schemas.creation import SectionKind
from app.schemas.models import AdditionalInfo, Education, Experience, Project
from app.services.improver import _sanitize_user_input

logger = logging.getLogger(__name__)

_JSON_SYSTEM = "You are a JSON extraction engine. Output only valid JSON, no explanations."


async def draft_section(
    section: SectionKind,
    answers: str,
    *,
    name: str = "",
    role: str = "",
    resume_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a validated fragment for ``section`` (see DraftSectionResponse.data)."""
    safe_answers = _sanitize_user_input(answers or "")
    safe_name = _sanitize_user_input(name or "")
    safe_role = _sanitize_user_input(role or "")
    language = get_language_name(get_content_language())

    if section == "work":
        prompt = DRAFT_WORK_PROMPT.format(
            output_language=language,
            name=safe_name or "the candidate",
            role=safe_role,
            answers=safe_answers,
        )
    elif section == "education":
        prompt = DRAFT_EDUCATION_PROMPT.format(
            output_language=language, name=safe_name or "the candidate", answers=safe_answers
        )
    elif section == "project":
        prompt = DRAFT_PROJECT_PROMPT.format(
            output_language=language, name=safe_name or "the candidate", answers=safe_answers
        )
    elif section == "skills":
        prompt = DRAFT_SKILLS_PROMPT.format(output_language=language, answers=safe_answers)
    elif section == "summary":
        resume_json = json.dumps(resume_context or {}, ensure_ascii=False)
        prompt = DRAFT_SUMMARY_PROMPT.format(
            output_language=language, name=safe_name or "the candidate", resume_json=resume_json
        )
    else:  # pragma: no cover - SectionKind is a closed Literal
        raise ValueError(f"Unknown section: {section}")

    raw = await complete_json(prompt=prompt, system_prompt=_JSON_SYSTEM, retries=2)

    # Validate against the canonical sub-schema; never return unvalidated LLM output.
    if section == "work":
        return Experience.model_validate(raw).model_dump()
    if section == "education":
        return Education.model_validate(raw).model_dump()
    if section == "project":
        return Project.model_validate(raw).model_dump()
    if section == "skills":
        validated = AdditionalInfo.model_validate({"technicalSkills": raw.get("technicalSkills", [])})
        return {"technicalSkills": validated.technicalSkills}
    # summary
    summary = raw.get("summary", "")
    return {"summary": summary if isinstance(summary, str) else str(summary)}
