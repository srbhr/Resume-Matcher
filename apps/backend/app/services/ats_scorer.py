"""ATS Pass 1 — extract keywords and score resume vs job description."""

import logging

from app.llm import complete_json
from app.prompts.ats import ATS_SCORE_PROMPT
from app.schemas.ats import KeywordRow, ScoreBreakdown
from app.utils.synonyms import normalize

logger = logging.getLogger(__name__)

_SCORE_CAPS: dict[str, float] = {
    "skills_match": 30.0,
    "experience_match": 25.0,
    "domain_match": 20.0,
    "tools_match": 15.0,
    "achievement_match": 10.0,
}

_FALLBACK_WARNING_FLAGS: list[str] = [
    "Missing quantified achievements in work experience",
    "Low keyword density compared to job description",
    "Role title does not closely match job description requirements",
    "Insufficient domain-specific terminology",
    "Missing required tools or technologies from the job description",
    "Action verbs are weak or passive in several bullet points",
    "No evidence of cross-functional collaboration mentioned",
    "Missing product lifecycle ownership or end-to-end delivery examples",
    "Insufficient years of directly relevant experience",
    "Missing industry-specific language and sector keywords",
]


def _clamp_scores(raw: dict) -> ScoreBreakdown:
    """Clamp each score dimension to its maximum and recalculate total."""
    clamped = {
        k: min(float(raw.get(k, 0.0)), cap)
        for k, cap in _SCORE_CAPS.items()
    }
    total = sum(clamped.values())
    return ScoreBreakdown(**clamped, total=total)


def _determine_decision(total: float) -> str:
    """Map numeric total score to PASS / BORDERLINE / REJECT."""
    if total >= 75.0:
        return "PASS"
    if total >= 60.0:
        return "BORDERLINE"
    return "REJECT"


def _pad_warning_flags(flags: list[str], decision: str) -> list[str]:
    """Ensure at least 10 warning flags when decision is REJECT."""
    if decision != "REJECT" or len(flags) >= 10:
        return flags
    existing_lower = {f.lower() for f in flags}
    extras = [f for f in _FALLBACK_WARNING_FLAGS if f.lower() not in existing_lower]
    needed = max(0, 10 - len(flags))
    return flags + extras[:needed]


async def run_pass1(resume_text: str, job_text: str) -> dict:
    """Pass 1: Normalize inputs, call LLM, validate and return scored result.

    Returns a dict with keys: score, decision, keyword_table,
    missing_keywords, warning_flags.
    """
    norm_resume = normalize(resume_text)
    norm_job = normalize(job_text)

    prompt = ATS_SCORE_PROMPT.format(
        resume_text=norm_resume,
        job_description=norm_job,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an ATS scoring engine. Output only valid JSON, no explanations.",
        max_tokens=4096,
    )

    score = _clamp_scores(result.get("score_breakdown", {}))
    decision = _determine_decision(score.total)

    raw_flags = result.get("warning_flags", [])
    if not isinstance(raw_flags, list):
        raw_flags = []
    warning_flags = _pad_warning_flags([str(f) for f in raw_flags], decision)

    raw_keywords = result.get("keyword_table", [])
    keyword_table = [
        KeywordRow(
            keyword=str(row.get("keyword", "")),
            found_in_resume=bool(row.get("found_in_resume", False)),
            section=row.get("section"),
        )
        for row in raw_keywords
        if isinstance(row, dict)
    ]

    missing = result.get("missing_keywords", [])
    if not isinstance(missing, list):
        missing = []

    return {
        "score": score,
        "decision": decision,
        "keyword_table": keyword_table,
        "missing_keywords": [str(k) for k in missing],
        "warning_flags": warning_flags,
    }
