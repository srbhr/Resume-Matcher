"""Critique-and-rewrite loop that improves resume writing without new facts.

One pass: code rules plus an AI critic find problems; lines with a hard
finding (em dash, weak opener, no outcome) get one AI rewrite as verified
diffs; every rewrite must pass the fact check or it is dropped; the code rules
then score the result. The loop never adds bullets and never invents numbers.
"""

import copy
import json
import logging
from dataclasses import dataclass
from typing import Any

from app.ai_budget import AIOperationDeadlineExceeded
from app.ai_limits import PromptSizeError
from app.llm import complete_json, get_llm_config, get_model_name, get_safe_max_tokens
from app.prompts.templates import get_language_name
from app.prompts.writing import (
    WRITING_CRITIQUE_PROMPT,
    WRITING_HEAVY_MODE_RULE,
    WRITING_REWRITE_PROMPT,
    WRITING_RUBRIC,
)
from app.schemas.models import ImproveDiffResult, ResumeChange
from app.schemas.writing import CriticNote, WritingFinding, WritingReport
from app.services.improver import _resolve_path, _sanitize_user_input, apply_diffs
from app.services.writing_quality import (
    check_writing,
    fact_violations,
    hard_paths,
    iter_writing_units,
    scrub_em_dashes,
    writing_score,
)

logger = logging.getLogger(__name__)

# The critic and the rewrite see at most this many lines; long resumes keep
# their first lines, which carry the most recent work.
MAX_LINES = 60


@dataclass
class WritingLoopResult:
    data: dict[str, Any]
    report: WritingReport


def _validate_critique(result: dict[str, Any]) -> dict[str, Any]:
    bullets = result.get("bullets")
    if not isinstance(bullets, list):
        raise ValueError("Critique response is missing 'bullets'")
    cleaned: list[dict[str, Any]] = []
    for item in bullets:
        if isinstance(item, dict) and isinstance(item.get("path"), str):
            cleaned.append(
                {
                    "path": item["path"],
                    "no_outcome": item.get("no_outcome") is True,
                    "weak_opener": item.get("weak_opener") is True,
                    "note": str(item.get("note") or "").strip()[:240],
                }
            )
    return {"bullets": cleaned}


def _validate_rewrite(result: dict[str, Any]) -> dict[str, Any]:
    if "changes" not in result:
        raise ValueError("Rewrite response is missing 'changes'")
    return ImproveDiffResult.model_validate(
        {"changes": result["changes"], "strategy_notes": ""}
    ).model_dump()


async def critique_writing(
    data: dict[str, Any], language: str
) -> dict[str, dict[str, Any]]:
    """Ask the AI critic which lines break the rubric. Keyed by path."""
    units = list(iter_writing_units(data))[:MAX_LINES]
    if not units:
        return {}
    known = {path for path, _ in units}
    prompt = WRITING_CRITIQUE_PROMPT.format(
        rubric=WRITING_RUBRIC,
        output_language=get_language_name(language),
        bullets="\n".join(
            f"{path} | {_sanitize_user_input(text)}" for path, text in units
        ),
    )
    config = get_llm_config()
    result = await complete_json(
        prompt=prompt,
        system_prompt="You are a strict resume reviewer. Output only valid JSON.",
        max_tokens=min(
            4096, get_safe_max_tokens(get_model_name(config), config=config)
        ),
        schema_type="diff",
        response_validator=_validate_critique,
    )
    return {
        item["path"]: item
        for item in _validate_critique(result)["bullets"]
        if item["path"] in known
    }


async def rewrite_writing(
    data: dict[str, Any],
    targets: list[tuple[str, str, list[str]]],
    language: str,
    *,
    heavy: bool = False,
) -> list[ResumeChange]:
    """Ask for one rewrite per target line, as verifiable replace diffs."""
    prompt = WRITING_REWRITE_PROMPT.format(
        rubric=WRITING_RUBRIC,
        output_language=get_language_name(language),
        mode_rule=WRITING_HEAVY_MODE_RULE if heavy else "",
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
        targets="\n".join(
            f"{path} | {', '.join(problems)} | {_sanitize_user_input(text)}"
            for path, text, problems in targets
        ),
    )
    config = get_llm_config()
    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an expert resume writer. Output only valid JSON.",
        max_tokens=get_safe_max_tokens(get_model_name(config), config=config),
        schema_type="diff",
        response_validator=_validate_rewrite,
    )
    return ImproveDiffResult.model_validate(_validate_rewrite(result)).changes


def _known_terms(data: dict[str, Any], extra: list[str]) -> list[str]:
    additional = data.get("additional")
    skills = additional.get("technicalSkills") if isinstance(additional, dict) else []
    terms = [s for s in skills or [] if isinstance(s, str)] + list(extra)
    return list(dict.fromkeys(t for t in terms if t.strip()))


def _problems(
    path: str, findings: list[WritingFinding], critic: dict[str, dict[str, Any]]
) -> list[str]:
    problems = [f.rule for f in findings if f.path == path and f.severity == "hard"]
    item = critic.get(path)
    if item:
        if item["no_outcome"]:
            problems.append("no_outcome")
        if item["weak_opener"] and "weak_opener" not in problems:
            problems.append("weak_opener")
    return problems


async def run_writing_loop(
    data: dict[str, Any],
    *,
    language: str,
    rewrite: bool = True,
    heavy: bool = False,
    known_terms: list[str] | None = None,
    progress: dict[str, str] | None = None,
) -> WritingLoopResult:
    """Critique ``data`` and rewrite the lines with hard findings once.

    Failures of the AI calls never fail the caller: the loop keeps the data it
    had and reports what the code rules found.
    """
    current = copy.deepcopy(data)
    findings = check_writing(current, language)
    critic: dict[str, dict[str, Any]] = {}
    if progress is not None:
        progress["stage"] = "critique_writing"
    try:
        critic = await critique_writing(current, language)
    except (AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.warning("Writing critique failed, using code rules only: %s", e)

    targets: list[tuple[str, str, list[str]]] = []
    texts = dict(iter_writing_units(current))
    candidate_paths = hard_paths(findings) + [
        path
        for path, item in critic.items()
        if item["no_outcome"] or item["weak_opener"]
    ]
    for path in list(dict.fromkeys(candidate_paths))[:MAX_LINES]:
        problems = _problems(path, findings, critic)
        if problems and path in texts:
            targets.append((path, texts[path], problems))

    rewritten: list[str] = []
    rejected = 0
    if rewrite and targets:
        if progress is not None:
            progress["stage"] = "rewrite_writing"
        terms = _known_terms(current, known_terms or [])
        target_paths = {path for path, _, _ in targets}
        try:
            changes = await rewrite_writing(current, targets, language, heavy=heavy)
        except (AIOperationDeadlineExceeded, PromptSizeError):
            raise
        except Exception as e:
            logger.warning("Writing rewrite failed, keeping the critiqued text: %s", e)
            changes = []
        accepted: list[ResumeChange] = []
        for change in changes:
            if (
                change.action != "replace"
                or change.path not in target_paths
                or not isinstance(change.value, str)
                or any(c.path == change.path for c in accepted)
            ):
                rejected += 1
                continue
            before, resolved = _resolve_path(current, change.path)
            after = scrub_em_dashes(change.value)
            if not resolved or not isinstance(before, str) or not after:
                rejected += 1
                continue
            violations = fact_violations(before, after, known_terms=terms)
            if violations:
                logger.info(
                    "Writing rewrite dropped at %s: %s", change.path, violations
                )
                rejected += 1
                continue
            accepted.append(change.model_copy(update={"value": after}))
        if accepted:
            current, applied, refused = apply_diffs(current, accepted)
            rewritten = [change.path for change in applied]
            rejected += len(refused)

    final_findings = check_writing(current, language)
    notes = [
        CriticNote(path=path, note=item["note"])
        for path, item in critic.items()
        if item["note"] and path not in rewritten
    ]
    report = WritingReport(
        score=writing_score(current, final_findings),
        findings=final_findings,
        critic_notes=notes,
        rewritten_paths=rewritten,
        rejected_rewrites=rejected,
    )
    return WritingLoopResult(data=current, report=report)


def finalized_writing_report(
    report: WritingReport | None,
    data: dict[str, Any],
    language: str,
    baseline: dict[str, Any] | None = None,
) -> WritingReport:
    """Rescore ``data`` (after the preservation layer) and add the baseline score.

    Keeps the loop's critic notes and rewrite counts; ``report`` is None when
    the loop did not run, and then only the code rules report.
    """
    findings = check_writing(data, language)
    before = (
        writing_score(baseline, check_writing(baseline, language))
        if baseline is not None
        else None
    )
    base = report or WritingReport()
    return base.model_copy(
        update={
            "score": writing_score(data, findings),
            "findings": findings,
            "before_score": before,
        }
    )
