"""Work user-chosen job keywords into a tailored preview, and show where they went.

The user picks missing keywords on the ATS card. Keywords the master does not
show need an explicit "I have this" (``attested``); that confirmation is the
only thing that lets a new term into the resume. Each keyword goes into the
skills list or summary, plus at most two existing lines where it fits; every
replaced line must keep all its facts and add nothing but the keyword.
"""

import json
import logging
from typing import Any

from app.ai_budget import AIOperationDeadlineExceeded
from app.ai_limits import PromptSizeError
from app.llm import complete_json, get_llm_config, get_model_name, get_safe_max_tokens
from app.prompts.templates import get_language_name
from app.prompts.writing import KEYWORD_PLACEMENT_PROMPT
from app.schemas.models import ImproveDiffResult, ResumeChange
from app.schemas.writing_report import KeywordPlacement
from app.services.improver import _resolve_path, _sanitize_user_input, apply_diffs
from app.services.refiner import _extract_all_text, _keyword_in_text
from app.services.writing_quality import (
    fact_violations,
    iter_writing_units,
    scrub_em_dashes,
)

logger = logging.getLogger(__name__)

MAX_LINES_PER_KEYWORD = 2
_SKILLS_PATH = "additional.technicalSkills"


def _validate_placement(result: dict[str, Any]) -> dict[str, Any]:
    if "changes" not in result:
        raise ValueError("Keyword placement response is missing 'changes'")
    return ImproveDiffResult.model_validate(
        {"changes": result["changes"], "strategy_notes": ""}
    ).model_dump()


async def _propose(
    data: dict[str, Any], keywords: list[str], job_description: str, language: str
) -> list[ResumeChange]:
    prompt = KEYWORD_PLACEMENT_PROMPT.format(
        keywords="\n".join(f"- {k}" for k in keywords),
        resume=json.dumps(
            {
                key: data.get(key)
                for key in (
                    "summary",
                    "workExperience",
                    "personalProjects",
                    "additional",
                )
            },
            ensure_ascii=False,
        ),
        job_description=_sanitize_user_input(job_description)[:4000],
        output_language=get_language_name(language),
    )
    config = get_llm_config()
    result = await complete_json(
        prompt=prompt,
        system_prompt="You are a careful resume editor. Output only valid JSON.",
        max_tokens=get_safe_max_tokens(get_model_name(config), config=config),
        schema_type="diff",
        response_validator=_validate_placement,
    )
    return ImproveDiffResult.model_validate(_validate_placement(result)).changes


def _skills(data: dict[str, Any]) -> list[str]:
    additional = data.get("additional")
    skills = additional.get("technicalSkills") if isinstance(additional, dict) else []
    return [s for s in skills or [] if isinstance(s, str)]


def _verified_changes(
    data: dict[str, Any], keywords: list[str], proposed: list[ResumeChange]
) -> list[ResumeChange]:
    """Keep only changes that place a requested keyword and add nothing else."""
    wanted = {k.casefold(): k for k in keywords}
    known = _skills(data)
    lines_used: dict[str, int] = {}
    seen_paths: set[str] = set()
    accepted: list[ResumeChange] = []
    for change in proposed:
        if change.action == "add_skill":
            value = change.value.strip() if isinstance(change.value, str) else ""
            keyword = wanted.get(value.casefold())
            if change.path == _SKILLS_PATH and keyword:
                accepted.append(
                    change.model_copy(update={"value": keyword, "original": None})
                )
            continue
        if change.action != "replace" or not isinstance(change.value, str):
            continue
        if change.path in seen_paths or (
            change.path != "summary"
            and not change.path.startswith(("workExperience[", "personalProjects["))
        ):
            continue
        before, resolved = _resolve_path(data, change.path)
        if not resolved or not isinstance(before, str):
            continue
        after = scrub_em_dashes(change.value)
        placed = [
            k
            for k in keywords
            if _keyword_in_text(k, after) and not _keyword_in_text(k, before)
        ]
        if not placed or any(
            lines_used.get(k, 0) >= MAX_LINES_PER_KEYWORD for k in placed
        ):
            continue
        violations = fact_violations(
            before, after, known_terms=known, allowed_additions=placed
        )
        if violations:
            logger.info("Keyword placement dropped at %s: %s", change.path, violations)
            continue
        for k in placed:
            lines_used[k] = lines_used.get(k, 0) + 1
        seen_paths.add(change.path)
        accepted.append(change.model_copy(update={"value": after}))
    return accepted


def keyword_placements(
    before: dict[str, Any], after: dict[str, Any], keywords: list[str]
) -> list[KeywordPlacement]:
    """Where each keyword appears in ``after`` but not at the same place in ``before``."""
    old_units = dict(iter_writing_units(before))
    new_units = dict(iter_writing_units(after))
    old_skills = {s.casefold() for s in _skills(before)}
    new_skills = {s.casefold() for s in _skills(after)}
    placements: list[KeywordPlacement] = []
    for keyword in keywords:
        paths = [
            path
            for path, text in new_units.items()
            if _keyword_in_text(keyword, text)
            and not _keyword_in_text(keyword, old_units.get(path, ""))
        ]
        if keyword.casefold() in new_skills and keyword.casefold() not in old_skills:
            paths.append(_SKILLS_PATH)
        placements.append(KeywordPlacement(keyword=keyword, paths=paths))
    return placements


async def force_keywords(
    data: dict[str, Any],
    keywords: list[str],
    job_description: str,
    language: str,
) -> dict[str, Any]:
    """Return ``data`` with each keyword placed; unplaced ones join the skills list.

    A failed AI call still places every keyword in the skills list, so an
    explicit request is never silently dropped.
    """
    pending = [k for k in keywords if not _keyword_in_text(k, _extract_all_text(data))]
    if not pending:
        return data
    try:
        proposed = await _propose(data, pending, job_description, language)
    except (AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.warning("Keyword placement failed, using the skills list: %s", e)
        proposed = []
    changes = _verified_changes(data, pending, proposed)
    result, _, rejected = apply_diffs(data, changes, allowed_skill_targets=pending)
    if rejected:
        logger.info(
            "Keyword placement: %d change(s) refused by apply_diffs", len(rejected)
        )
    text = _extract_all_text(result)
    missing = [k for k in pending if not _keyword_in_text(k, text)]
    if missing:
        fallback = [
            ResumeChange(
                path=_SKILLS_PATH,
                action="add_skill",
                original=None,
                value=k,
                reason="requested keyword",
            )
            for k in missing
        ]
        result, _, _ = apply_diffs(result, fallback, allowed_skill_targets=missing)
    return result
