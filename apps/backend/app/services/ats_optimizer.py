"""ATS Pass 2 — generate an optimized resume from the gap analysis."""

import json
import logging

from app.llm import complete_json
from app.prompts.ats import ATS_OPTIMIZE_PROMPT
from app.prompts.templates import CRITICAL_TRUTHFULNESS_RULES, RESUME_SCHEMA_EXAMPLE
from app.schemas.models import ResumeData

logger = logging.getLogger(__name__)


async def run_pass2(
    resume_json: dict,
    job_text: str,
    score_data: dict,
) -> dict:
    """Pass 2: Generate an ATS-optimized resume from the gap analysis.

    Args:
        resume_json: The candidate's structured resume (ResumeData-compatible dict).
        job_text: The raw job description text.
        score_data: The dict returned by run_pass1 (score, decision, missing_keywords,
                    warning_flags).

    Returns:
        Dict with keys: optimized_resume (ResumeData), optimization_suggestions (list[str]).
    """
    missing_keywords = ", ".join(score_data.get("missing_keywords", [])) or "none identified"
    warning_flags_text = "\n".join(
        f"- {f}" for f in score_data.get("warning_flags", [])
    ) or "- none"

    score_obj = score_data.get("score")
    score_breakdown_text = (
        json.dumps(score_obj.model_dump(), indent=2)
        if hasattr(score_obj, "model_dump")
        else json.dumps(score_obj or {}, indent=2)
    )

    prompt = ATS_OPTIMIZE_PROMPT.format(
        critical_truthfulness_rules=CRITICAL_TRUTHFULNESS_RULES["keywords"],
        missing_keywords=missing_keywords,
        warning_flags=warning_flags_text,
        score_breakdown=score_breakdown_text,
        job_description=job_text,
        resume_json=json.dumps(resume_json, indent=2),
        schema=RESUME_SCHEMA_EXAMPLE,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an ATS resume optimizer. Output only valid JSON.",
        max_tokens=8192,
    )

    optimized_raw = result.get("optimized_resume", {})
    if not isinstance(optimized_raw, dict):
        optimized_raw = {}

    try:
        optimized_resume = ResumeData.model_validate(optimized_raw)
    except Exception as exc:
        logger.warning("Pass 2 produced an invalid ResumeData structure: %s", exc)
        raise

    suggestions = result.get("optimization_suggestions", [])
    if not isinstance(suggestions, list):
        suggestions = []

    return {
        "optimized_resume": optimized_resume,
        "optimization_suggestions": [str(s) for s in suggestions if s],
    }
