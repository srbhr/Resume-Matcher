"""LLM-judge move — reuses the eval rubric via app.llm.complete_json."""

from __future__ import annotations

import json
from typing import Any

# Share of the tailored resume that may incorporate job-description keywords/skills
# the master resume lacked before the judge should treat it as fabrication rather
# than legitimate ATS tailoring. Maintainer policy (2026-06): surfacing JD keywords
# IS the product's job, so a moderate amount is expected and must not be scored as a
# truthfulness violation. This knob ONLY softens the judge's (LLM, qualitative)
# truthfulness lens — the hard structural guards in flow.score_tailoring
# (no_fabricated_employers, personal_info_unchanged) stay strict and are NOT affected.
# Trade-off (flagged at review): a higher value buys ATS match at the cost of letting
# more JD-sourced claims through; employers, titles, dates, and overall profession
# stay inviolate regardless. Dial this down to tighten truthfulness.
JD_KEYWORD_TOLERANCE = 0.20

_RUBRIC = (  # diverges from tests/evals/test_tailoring_eval.py by design — adds the JD tolerance
    "You are a strict but fair technical recruiter grading how well a resume was "
    "tailored to a job description on RELEVANCE, TRUTHFULNESS, and FORMATTING. "
    "Incorporating job-description keywords and skills into the resume is EXPECTED, "
    "legitimate tailoring (ATS optimization), not fabrication: do NOT lower the score "
    f"when up to ~{int(JD_KEYWORD_TOLERANCE * 100)}% of the resume's content is "
    "JD-sourced wording the master lacked, PROVIDED the candidate's employers, job "
    "titles, dates, and overall profession remain unchanged. DO still penalize invented "
    "employers, fabricated titles or dates, and a wholesale change of profession the "
    "master never supported (e.g. a backend engineer rewritten as a career frontend dev). "
    'Return ONLY JSON {"score": <int 1-5>, "reasons": "<one or two sentences>"}.'
)


def _normalize_score(raw: Any) -> int | None:
    """Coerce a judge score to an int in 1-5, or None. Rejects bools, non-finite, junk.

    The whole conversion is wrapped in one try/except so a huge int (``float()``
    OverflowError), ``inf``/``nan`` (``int()`` on a non-finite), or junk string
    (``float()`` ValueError) all fail closed to ``None``. Uses round-half-up
    (``int(x + 0.5)``) rather than ``round()``'s banker's rounding, since scores
    are small positive integers.
    """
    if isinstance(raw, bool):
        return None
    try:
        if isinstance(raw, (int, float)):
            candidate = float(raw)
        elif isinstance(raw, str):
            candidate = float(raw.strip())
        else:
            return None
        value = int(candidate + 0.5)  # round half up; raises on inf/nan
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
