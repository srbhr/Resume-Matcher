"""LLM relevance scoring for master-resume bullets (scores only, never edits)."""

import json
import logging
import math
from typing import Any, Callable, Literal

from app.ai_budget import AIOperationDeadlineExceeded
from app.ai_limits import PromptSizeError
from app.llm import complete_json
from app.prompts import BULLET_RELEVANCE_PROMPT
from app.services.bullet_selector import BulletKey, bullet_path, iter_bullet_rows
from app.services.improver import _sanitize_user_input
from app.services.refiner import _keyword_in_text

logger = logging.getLogger(__name__)

ScoringSource = Literal["llm", "keyword_fallback"]
_JOB_TERM_KEYS = (
    "required_skills",
    "preferred_skills",
    "keywords",
    "key_responsibilities",
)


def _entry_label(section: str, entry: dict[str, Any]) -> str:
    """Generate a human-readable label for a bullet's entry (role context)."""
    if section == "workExperience":
        return f"{entry.get('title', '')} @ {entry.get('company', '')}".strip()
    return str(entry.get("name", "")).strip()


def _bullet_lines(data: dict[str, Any]) -> tuple[list[str], dict[str, BulletKey]]:
    """Extract all selectable bullets and map path strings to BulletKeys.

    Returns:
        (lines, paths) where lines are formatted "- path | role | text" strings
        and paths maps path strings to BulletKey tuples.
    """
    lines: list[str] = []
    paths: dict[str, BulletKey] = {}
    for key, text, entry in iter_bullet_rows(data):
        path = bullet_path(*key)
        paths[path] = key
        lines.append(f"- {path} | {_entry_label(key[0], entry)} | {text.strip()}")
    return lines, paths


def _make_validator(
    paths: dict[str, BulletKey],
) -> Callable[[dict[str, Any]], dict[str, Any]]:
    """Create a response validator: clamps scores to [0, 100], drops unknown paths and
    non-finite scores (NaN/Infinity would otherwise clamp to 100)."""

    def validate(response: dict[str, Any]) -> dict[str, Any]:
        items = response.get("scores")
        if not isinstance(items, list):
            raise ValueError("scores must be a list")
        cleaned: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            path = item.get("path")
            score = item.get("score")
            if (
                not isinstance(path, str)
                or path not in paths
                or isinstance(score, bool)
            ):
                continue
            if isinstance(score, int):
                # JSON ints are unbounded and float() raises OverflowError past ~1e308, so
                # clamp first: a huge int becomes 100 (or 0), like any out-of-range score.
                cleaned.append({"path": path, "score": float(max(0, min(100, score)))})
            elif isinstance(score, float) and math.isfinite(score):
                cleaned.append({"path": path, "score": max(0.0, min(100.0, score))})
        if not cleaned:
            raise ValueError("no known bullet paths were scored")
        return {"scores": cleaned}

    return validate


def _job_terms(job_keywords: dict[str, Any]) -> set[str]:
    """Extract all JD keyword terms (lowercased) from job_keywords dict."""
    terms: set[str] = set()
    for key in _JOB_TERM_KEYS:
        values = job_keywords.get(key)
        if isinstance(values, list):
            terms.update(
                v.strip().lower() for v in values if isinstance(v, str) and v.strip()
            )
    return terms


def keyword_scores(
    data: dict[str, Any], job_keywords: dict[str, Any]
) -> dict[BulletKey, float]:
    """Deterministic fallback: 20 points per distinct JD term found, capped at 100.

    Counts how many distinct job keywords appear in each bullet (case-insensitive,
    via the refiner's ``_keyword_in_text``: whole terms, substrings for CJK) and
    scores it as 20 points per keyword, maxed at 100.

    Args:
        data: Resume data with selectable sections
        job_keywords: Dict with keys like "required_skills", "keywords", etc.

    Returns:
        Mapping of BulletKey to score (0.0-100.0)
    """
    terms = _job_terms(job_keywords)
    scores: dict[BulletKey, float] = {}
    for key, text, _entry in iter_bullet_rows(data):
        hits = sum(1 for term in terms if _keyword_in_text(term, text))
        scores[key] = float(min(100, 20 * hits))
    return scores


async def score_bullets(
    data: dict[str, Any],
    job_description: str,
    job_keywords: dict[str, Any],
) -> tuple[dict[BulletKey, float], ScoringSource]:
    """Score every selectable bullet 0-100; falls back to keyword overlap on failure.

    Uses the LLM to score bullets on relevance to a job description.
    If the LLM fails, falls back to a deterministic keyword-matching approach.
    If there are no bullets, returns empty dict with "llm" source.

    Args:
        data: Resume data with selectable sections
        job_description: The job description text
        job_keywords: Extracted job keywords dict

    Returns:
        (scores, source) where scores maps BulletKey to float (0-100) and source
        is either "llm" or "keyword_fallback"
    """
    lines, paths = _bullet_lines(data)
    if not lines:
        return {}, "llm"
    prompt = BULLET_RELEVANCE_PROMPT.format(
        job_description=_sanitize_user_input(job_description),
        job_keywords=json.dumps(job_keywords, ensure_ascii=False),
        bullets="\n".join(lines),
    )
    try:
        response = await complete_json(
            prompt=prompt,
            system_prompt="You score resume bullets for relevance to a job. You never rewrite them.",
            max_tokens=4096,
            schema_type="bullet_scores",
            response_validator=_make_validator(paths),
        )
    except (AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.warning("Bullet scoring failed; using keyword fallback: %s", e)
        return keyword_scores(data, job_keywords), "keyword_fallback"
    scores: dict[BulletKey, float] = {key: 0.0 for key in paths.values()}
    for item in response["scores"]:
        scores[paths[item["path"]]] = item["score"]
    return scores, "llm"
