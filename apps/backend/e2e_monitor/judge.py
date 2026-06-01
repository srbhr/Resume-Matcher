"""LLM-judge move — reuses the eval rubric via app.llm.complete_json."""

from __future__ import annotations

import json
from typing import Any

_RUBRIC = (  # mirrors tests/evals/test_tailoring_eval.py::_JUDGE_RUBRIC
    "You are a strict but fair technical recruiter grading how well a resume was "
    "tailored to a job description on RELEVANCE, TRUTHFULNESS, and FORMATTING. "
    'Return ONLY JSON {"score": <int 1-5>, "reasons": "<one or two sentences>"}.'
)


def _normalize_score(raw: Any) -> int | None:
    """Coerce a judge score to an int in 1-5, or None. Rejects bools, non-finite, junk."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        candidate: float = float(raw)
    elif isinstance(raw, str):
        try:
            candidate = float(raw.strip())
        except ValueError:
            return None
    else:
        return None
    try:
        value = round(candidate)  # round (not truncate); raises on inf/nan
    except (ValueError, OverflowError):
        return None
    return value if 1 <= value <= 5 else None


async def judge_variation(job_description: str, tailored: dict[str, Any]) -> dict[str, Any]:
    """Score one (JD, tailored) pair 1-5. Caller must be past the opt-in gate."""
    from app.llm import complete_json

    prompt = (
        f"{_RUBRIC}\n\n=== JOB DESCRIPTION ===\n{job_description}\n\n"
        f"=== TAILORED RESUME (JSON) ===\n{json.dumps(tailored, ensure_ascii=False, indent=2)}\n"
    )
    result = await complete_json(
        prompt,
        system_prompt="You are an impartial resume-tailoring evaluator.",
        max_tokens=512,
        schema_type="keywords",  # "keywords" skips truncation heuristics; judge dict is accepted on the first call
    )
    if not isinstance(result, dict):
        return {"score": None, "reasons": str(result)}
    return {"score": _normalize_score(result.get("score")), "reasons": str(result.get("reasons", ""))}
