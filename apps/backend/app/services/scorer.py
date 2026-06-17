"""Resume-vs-job scoring service.

Ported from scorer.py (resume-job-matcher project) with these changes:
- All AI calls go through app.llm (LiteLLM) instead of direct SDK clients.
- PDF extraction and visual quality scoring are dropped — resumes are already
  stored as structured JSON in the database.
- All functions are async.
- No personal data (resume content, candidate info, job text) is logged.
"""

import asyncio
import json
import logging
from typing import Any

from fastapi import HTTPException

from app.config import settings
from app.database import db
from app.llm import complete, complete_json

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Scoring token limits
# ---------------------------------------------------------------------------

def _get_scoring_tokens() -> tuple[int, int]:
    """Return (criterion, reasons) max_tokens from config.json with env fallback.

    Reads from the persisted config file so UI changes take effect without
    restarting the server. Falls back to env-var / default values when the key
    is absent.
    """
    from app.config import load_config_file
    stored = load_config_file()
    return (
        stored.get("scoring_max_tokens_criterion", settings.scoring_max_tokens_criterion),
        stored.get("scoring_max_tokens_reasons", settings.scoring_max_tokens_reasons),
    )

# ---------------------------------------------------------------------------
# Scoring criteria (name, key, weight_key, default_weight, factors)
# ---------------------------------------------------------------------------

_CRITERIA: list[tuple[str, str, str, int, list[str]]] = [
    (
        "Language Proficiency",
        "language_proficiency",
        "language_proficiency_weight",
        5,
        ["Proficiency in required languages", "Multilingual abilities"],
    ),
    (
        "Education Level",
        "education_level",
        "education_weight",
        10,
        ["Highest education level", "Relevance of degree", "Alternative education paths"],
    ),
    (
        "Years of Experience",
        "experience_years",
        "experience_weight",
        20,
        ["Total relevant experience", "Quality of previous roles", "Significant achievements"],
    ),
    (
        "Technical Skills",
        "technical_skills",
        "technical_skills_weight",
        50,
        ["Required technical skills", "Optional skills", "Transferable skills", "Keyword match"],
    ),
    (
        "Certifications",
        "certifications",
        "certifications_weight",
        5,
        ["Preferred certifications", "Equivalent practical experience"],
    ),
    (
        "Soft Skills",
        "soft_skills",
        "soft_skills_weight",
        9,
        ["Demonstrated soft skills", "Teamwork, leadership, problem-solving examples"],
    ),
    (
        "Location",
        "location",
        "location_weight",
        50,
        ["Country match", "City match", "Willingness to relocate", "Score 0 if explicitly excluded"],
    ),
]


# ---------------------------------------------------------------------------
# Score label lookup
# ---------------------------------------------------------------------------

_SCORE_RANGES: list[tuple[int, int, str, str]] = [
    (100, 101, "rainbow", "Legendary Unicorn"),
    (99,  100, "gold",    "Dream Candidate"),
    (98,   99, "magenta", "Exceptional Fit"),
    (97,   98, "magenta", "Outstanding Candidate"),
    (96,   97, "magenta", "Superb Applicant"),
    (95,   96, "magenta", "Excellent Choice"),
    (94,   95, "blue",    "Top Prospect"),
    (93,   94, "blue",    "Strong Contender"),
    (92,   93, "blue",    "Impressive Talent"),
    (91,   92, "cyan",    "Highly Qualified"),
    (90,   91, "cyan",    "Great Potential"),
    (88,   90, "cyan",    "Very Promising"),
    (86,   88, "green",   "Solid Candidate"),
    (84,   86, "green",   "Good Fit"),
    (82,   84, "green",   "Suitable Match"),
    (80,   82, "green",   "Potential Hire"),
    (78,   80, "green",   "Possible Fit"),
    (76,   78, "green",   "Fair Prospect"),
    (74,   76, "green",   "Moderate Match"),
    (72,   74, "yellow",  "Average Candidate"),
    (70,   72, "yellow",  "Partial Fit"),
    (68,   70, "yellow",  "Limited Potential"),
    (66,   68, "yellow",  "Weak Match"),
    (64,   66, "yellow",  "Minimal Alignment"),
    (62,   64, "yellow",  "Low Compatibility"),
    (60,   62, "yellow",  "Needs Improvement"),
    (58,   60, "yellow",  "Considerable Gap"),
    (56,   58, "yellow",  "Poor Fit"),
    (54,   56, "yellow",  "Significant Mismatch"),
    (52,   54, "yellow",  "Major Differences"),
    (50,   52, "yellow",  "Substantial Gap"),
    (45,   50, "red",     "Unqualified Candidate"),
    (40,   45, "red",     "Mismatched Skills"),
    (35,   40, "red",     "Inadequate Fit"),
    (30,   35, "red",     "Unsuitable Applicant"),
    (25,   30, "red",     "Incompatible Match"),
    (20,   25, "red",     "Irrelevant Background"),
    (15,   20, "red",     "Completely Misaligned"),
    (10,   15, "red",     "Wrong Field"),
    (5,    10, "black",   "Possibly Unsuitable"),
    (0,     5, "black",   "No Match"),
]


def get_score_details(score: int) -> tuple[str, str]:
    """Map a 0-100 score to (color, label)."""
    for lo, hi, color, label in _SCORE_RANGES:
        if lo <= score < hi:
            return color, label
    return "red", "Unable to score"


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

def _parse_int_score(response: str) -> int:
    """Parse an integer score 0-100 from an LLM response string.

    Extracts the first integer found anywhere in the response so that brief
    model preambles like 'Score: 75' or trailing newlines don't cause a miss.
    """
    import re
    match = re.search(r"\b(\d{1,3})\b", str(response))
    if match:
        return max(0, min(100, int(match.group(1))))
    return 0


async def extract_job_requirements(job_desc: str) -> dict[str, Any] | None:
    """Parse a job description into structured requirements with scoring weights.

    Returns a dict on success, or None if the LLM call fails or the response
    is missing the required 'emphasis' block.
    Does not log job description content.
    """
    prompt = f"""Extract the key requirements from the following job description.

Job Description:
{job_desc}

Output valid JSON only — no explanation, no code fences:
{{
  "required_experience_years": integer,
  "required_education_level": string,
  "required_skills": [list of strings],
  "optional_skills": [list of strings],
  "certifications_preferred": [list of strings],
  "soft_skills": [list of strings],
  "keywords_to_match": [list of strings],
  "location": {{"country": string, "city": string}},
  "emphasis": {{
    "technical_skills_weight": integer,
    "soft_skills_weight": integer,
    "experience_weight": integer,
    "education_weight": integer,
    "language_proficiency_weight": integer,
    "certifications_weight": integer,
    "location_weight": integer
  }}
}}"""
    try:
        result = await complete_json(prompt, max_tokens=2000)
        if "emphasis" not in result:
            logger.warning("Job requirements response missing 'emphasis' block")
            return None
        return result
    except Exception:
        logger.warning("Failed to extract job requirements from LLM response")
        return None


async def _score_criterion(
    name: str,
    factors: list[str],
    resume_text: str,
    job_requirements: dict[str, Any],
) -> int:
    """Score a single criterion 0-100 using the LLM. Does not log resume content."""
    prompt = f"""Evaluate the candidate's resume for the criterion: "{name}".

The resume is provided as structured JSON — infer information from any field
regardless of key names or section labels (e.g. skills may appear under
"technicalSkills", "skills", "additional", or elsewhere).

Factors to consider: {', '.join(factors)}

Job Requirements:
{json.dumps(job_requirements, indent=2)}

Apply negative selection (score 0) only for hard disqualifiers such as an
explicit location exclusion or a missing mandatory licence. For everything
else, award partial credit proportional to the match.

Resume (JSON):
{resume_text}

Return only an integer 0-100. Nothing else."""
    try:
        max_tokens_criterion, _ = _get_scoring_tokens()
        response = await complete(prompt, max_tokens=max_tokens_criterion)
        return _parse_int_score(response)
    except Exception:
        logger.warning("LLM criterion scoring failed for criterion: %s", name)
        return 0


async def _compute_ai_match(
    resume_text: str,
    job_desc: str,
) -> dict[str, Any]:
    """Score a resume against a job description across 7 weighted criteria.

    All 7 criterion calls are issued in parallel for speed.
    Does not log resume or job content.
    """
    job_requirements = await extract_job_requirements(job_desc)
    if not job_requirements:
        return {
            "score": 0,
            "match_reasons": "",
            "red_flags": {"critical": [], "major": [], "minor": []},
        }

    emphasis = job_requirements.get("emphasis", {})

    # Fire all criterion evaluations in parallel
    criterion_tasks = [
        _score_criterion(name, factors, resume_text, job_requirements)
        for name, _key, _wkey, _default, factors in _CRITERIA
    ]

    reasons_prompt = f"""List 3-4 key reasons for/against this resume-job match.
Telegraphic English, max 10 words each, separated by ' | '.

Resume: {resume_text}
Job Requirements: {json.dumps(job_requirements, indent=2)}

Output only the reasons string. No intro."""

    _, max_tokens_reasons = _get_scoring_tokens()
    all_results = await asyncio.gather(
        *criterion_tasks,
        complete(reasons_prompt, max_tokens=max_tokens_reasons),
        return_exceptions=True,
    )

    scores = all_results[:len(_CRITERIA)]
    reasons_raw = all_results[len(_CRITERIA)]

    red_flags: dict[str, list[str]] = {"critical": [], "major": [], "minor": []}
    total_weight = 0.0
    total_score = 0.0

    for (name, _key, weight_key, default_weight, _factors), score in zip(_CRITERIA, scores):
        weight = emphasis.get(weight_key, default_weight)
        total_weight += weight

        if isinstance(score, Exception):
            logger.warning("Criterion scoring raised exception for: %s", name)
            score = 0
        elif not isinstance(score, int):
            logger.warning("Criterion scoring returned non-integer for: %s", name)
            score = 0

        if score < 10:
            if weight >= 30:
                red_flags["critical"].append(name)
            elif weight >= 20:
                red_flags["major"].append(name)
            else:
                red_flags["minor"].append(name)

        total_score += (score * weight) / 100

    ai_score = int((total_score / total_weight) * 100) if total_weight else 0

    match_reasons = ""
    if isinstance(reasons_raw, str):
        match_reasons = reasons_raw.strip()
    else:
        logger.warning("Match reasons LLM call failed")

    return {
        "score": ai_score,
        "match_reasons": match_reasons,
        "red_flags": red_flags,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def score_resume(resume_id: str, job_id: str) -> dict[str, Any]:
    """Score a resume against a job description, using the cache when available.

    Args:
        resume_id: ID of the resume in the database.
        job_id:    ID of the job description in the database.

    Returns:
        Score result dict matching the ScoreResult schema, with a 'cached' flag.

    Raises:
        HTTPException 404: if resume or job does not exist.
        HTTPException 400: if resume has no processed data.
        HTTPException 500: if the LLM scoring call fails.
    """
    # Cache-first: avoid LLM cost on repeated requests
    cached = await db.get_score(resume_id, job_id)
    if cached:
        return {**cached, "cached": True}

    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")

    processed_data = resume.get("processed_data")
    if not processed_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data. Please re-upload the resume.",
        )

    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    resume_text = json.dumps(processed_data, indent=2)
    job_desc = job["content"]

    try:
        ai_result = await _compute_ai_match(resume_text, job_desc)
    except Exception:
        logger.error("Scoring failed for resume_id=%s job_id=%s", resume_id, job_id)
        raise HTTPException(
            status_code=500,
            detail="Scoring failed. Please try again.",
        )

    final_score = max(0, min(100, ai_result["score"]))
    color, label = get_score_details(final_score)

    result = {
        "score": final_score,
        "ai_score": ai_result["score"],
        "match_reasons": ai_result["match_reasons"],
        "red_flags": ai_result["red_flags"],
        "label": label,
        "color": color,
    }

    saved = await db.create_score(resume_id, job_id, result)

    return {
        **saved,
        "cached": False,
    }
