"""The tailoring pipeline: preview, queue-worker run and their shared steps.

Moved out of ``routers/resumes.py`` so the queue worker (a service) no longer
imports a router. HTTP concerns stay in the router.
"""

import asyncio
import copy
import hashlib
import json
import logging
import unicodedata
from collections.abc import Awaitable
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError

from app.ai_budget import (
    AIOperationDeadlineExceeded,
    remaining_timeout,
)
from app.ai_limits import MAX_JOB_CHARACTERS, PromptSizeError, require_source_size
from app.config import settings
from app.config_cache import get_content_language
from app.config_cache import load_config as _load_config
from app.database import (
    DatabaseBusyError,
    db,
)
from app.preview import (
    job_fingerprint,
    resume_fingerprint,
)
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_PROMPT_OPTIONS
from app.schemas import (
    ATSScore,
    ATSScoreRecord,
    ATSSubScores,
    ImproveResumeData,
    ImproveResumeRequest,
    ImproveResumeResponse,
    InterviewPrepData,
    RefinementStats,
    ResumeData,
    ResumeDiffSummary,
    ResumeFieldDiff,
)
from app.schemas.refinement import RefinementConfig
from app.schemas.writing_report import WritingReport
from app.services.ats import compute_ats_score
from app.services.bullet_selector import SELECTABLE_SECTIONS
from app.services.cover_letter import (
    generate_cover_letter,
    generate_outreach_message,
    generate_resume_title,
)
from app.services.improver import (
    apply_diffs,
    extract_job_keywords,
    generate_improvements,
    generate_resume_diffs,
    generate_skill_target_plan,
    improve_resume,
    is_fixed_row_append,
    verify_diff_result,
    verify_skill_target_plan,
)
from app.services.interview_prep import generate_interview_prep
from app.services.page_fit import page_limit
from app.services.parser import (
    restore_dates_from_markdown,
)
from app.services.refiner import (
    analyze_keyword_gaps,
    calculate_keyword_match,
    count_retained_keywords,
    job_keyword_terms,
    refine_resume,
)
from app.services.resume_preservation import (
    finalize_ai_resume,
    grounding_review_warnings,
    validate_confirmed_resume,
)
from app.services.safety_nets import (
    preserve_original_skills,
    preserve_personal_info,
    protect_custom_sections,
    restore_original_dates,
)
from app.services.tailor_selection import (
    PAGE_FIT_FINAL_OVER_WARNING,
    final_page_check,
    run_bullet_selection,
)
from app.services.writing_loop import finalized_writing_report, run_writing_loop

logger = logging.getLogger(__name__)

REFINEMENT_FAILED_WARNING = "REFINEMENT_FAILED: Resume refinement was unavailable; the previous result was kept."


DIFF_UNAVAILABLE_WARNING = "DIFF_UNAVAILABLE: Resume changes could not be calculated."


async def auto_create_tracker_application(
    *,
    job_id: str,
    tailored_resume_id: str,
    master_resume_id: str,
    job: dict[str, Any] | None,
    title: str | None,
) -> None:
    """Best-effort: drop an ``applied`` card on the tracker after a tailoring.

    Company/role come from the cached job (zero extra LLM call). Wrapped so a
    tracker failure can never break the tailoring flow.
    """
    try:
        if title is None:
            saved_resume = await db.get_resume(tailored_resume_id)
            title = (saved_resume or {}).get("title")
        company = (job or {}).get("company")
        role = title or (job or {}).get("role")
        await db.create_application(
            job_id=job_id,
            resume_id=tailored_resume_id,
            master_resume_id=master_resume_id,
            status="applied",
            company=company,
            role=role,
        )
    except Exception as e:  # noqa: BLE001 - tracker is non-critical
        logger.warning("Failed to auto-create tracker application: %s", e)


def get_default_prompt_id() -> str:
    """Get configured default prompt id from config file."""
    config = _load_config()
    option_ids = {option["id"] for option in IMPROVE_PROMPT_OPTIONS}
    prompt_id = config.get("default_prompt_id", DEFAULT_IMPROVE_PROMPT_ID)
    return prompt_id if prompt_id in option_ids else DEFAULT_IMPROVE_PROMPT_ID


def hash_job_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


async def _cache_job_keywords(
    job_id: str, content_hash: str, job_keywords: dict[str, Any]
) -> dict[str, Any] | None:
    """Best-effort: cache extracted keywords on the job with its content hash.

    The hash gives basic invalidation, and ATS recalculation reads this cache.
    Company/role are also surfaced to the job's top level so the tracker's
    auto-create-on-confirm path can read them without an extra LLM call.
    Returns the updated job, or None when it could not be persisted.
    """
    cache_updates: dict[str, Any] = {
        "job_keywords": job_keywords,
        "job_keywords_hash": content_hash,
    }
    # LLM output isn't guaranteed to be a string — guard before .strip().
    raw_company = job_keywords.get("company")
    raw_role = job_keywords.get("role")
    company = raw_company.strip() if isinstance(raw_company, str) else ""
    role = raw_role.strip() if isinstance(raw_role, str) else ""
    if company:
        cache_updates["company"] = company
    if role:
        cache_updates["role"] = role
    try:
        updated_job = await db.update_job(job_id, cache_updates)
        if not updated_job:
            logger.warning("Failed to persist job keywords for job %s.", job_id)
        return updated_job
    except Exception as e:
        logger.warning("Failed to persist job keywords for job %s: %s", job_id, e)
        return None


def _normalize_payload(value: Any) -> Any:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [_normalize_payload(item) for item in value]
    if isinstance(value, dict):
        normalized: dict[Any, Any] = {}
        for key, val in value.items():
            normalized_key = (
                unicodedata.normalize("NFC", key) if isinstance(key, str) else key
            )
            normalized[normalized_key] = _normalize_payload(val)
        return normalized
    return value


def serialize_interview_prep(interview_prep: InterviewPrepData | None) -> str | None:
    if interview_prep is None:
        return None
    return json.dumps(interview_prep.model_dump(mode="json"), ensure_ascii=False)


def hash_improved_data(data: dict[str, Any]) -> str:
    """Hash canonicalized improved data for preview/confirm validation.

    Canonicalize through ``ResumeData`` first so a payload that merely omits
    optional fields (which the schema defaults) hashes identically to its
    schema-complete form. Without this, ``improve/preview`` (which hashes the
    raw ``improved_data`` dict) and ``improve/confirm`` (which hashes the
    ``ResumeData`` round-trip, ``request.improved_data.model_dump()``) disagree
    for any stored resume whose ``processed_data`` is not schema-complete, and a
    valid tailoring is rejected with 400 ("preview hash mismatch").
    """
    try:
        canonical: dict[str, Any] = ResumeData.model_validate(data).model_dump()
    except ValidationError:
        canonical = data  # not a full resume payload; hash as-is
    normalized = _normalize_payload(canonical)
    serialized = json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,  # Preserve original behavior for hash stability
        default=str,  # Handle non-serializable types gracefully
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def validate_ai_sources(
    resume: dict[str, Any], job: dict[str, Any] | None = None
) -> None:
    """Check all stored inputs before starting expensive AI work."""
    for field in ("content", "original_markdown", "processed_data"):
        value = resume.get(field)
        if value:
            require_source_size(value)
    if job is not None:
        require_source_size(job.get("content", ""), MAX_JOB_CHARACTERS)


def get_original_resume_data(resume: dict[str, Any]) -> dict[str, Any] | None:
    original_data = resume.get("processed_data")
    if not original_data and resume.get("content_type") == "json":
        try:
            original_data = json.loads(resume["content"])
        except json.JSONDecodeError as e:
            logger.warning("Skipping resume diff due to JSON parse failure: %s", e)
    return original_data


async def grounding_master_data(resume: dict[str, Any]) -> dict[str, Any] | None:
    """Truth source for refinement: the source master, its parent master, else the default."""
    if resume.get("is_master", False):
        return get_original_resume_data(resume)
    parent_id = resume.get("parent_id")
    parent = await db.get_resume(parent_id) if parent_id else None
    if parent and parent.get("is_master", False):
        return get_original_resume_data(parent)
    master_resume = await db.get_master_resume()
    if master_resume:
        return get_original_resume_data(master_resume)
    return get_original_resume_data(resume)


def _get_original_markdown(resume: dict[str, Any]) -> str | None:
    """Get the original markdown content from a resume.

    Checks ``original_markdown`` first (persisted at upload), then
    falls back to ``content`` if it's still in markdown format.
    """
    md = resume.get("original_markdown")
    if md and isinstance(md, str):
        return md
    if resume.get("content_type") == "md":
        content = resume.get("content", "")
        if content and isinstance(content, str):
            return content
    return None


def _finalized_refinement_stats(
    stats: RefinementStats,
    applied_keywords: list[str],
    finalized_data: dict[str, Any],
    job_keywords: dict[str, Any],
) -> RefinementStats:
    """Report only keyword changes retained in the finalized resume."""
    return stats.model_copy(
        update={
            "keywords_injected": count_retained_keywords(
                applied_keywords, finalized_data
            ),
            "final_match_percentage": calculate_keyword_match(
                finalized_data, job_keywords
            ),
        }
    )


def _build_ats_score(
    improved_data: dict[str, Any],
    job_keywords: dict[str, Any],
    refinement_result: Any,
    refinement_successful: bool,
) -> ATSScore | None:
    """Build ATSScore from refinement result and resume data."""
    return ats_score_model(
        improved_data,
        job_keywords,
        refinement_result.keyword_analysis
        if refinement_successful and refinement_result is not None
        else None,
    )


def ats_score_model(
    improved_data: dict[str, Any],
    job_keywords: dict[str, Any],
    kw_analysis: Any,
) -> ATSScore | None:
    """ATSScore for ``improved_data``; keyword lists come from ``kw_analysis``."""
    try:
        final_match = calculate_keyword_match(improved_data, job_keywords)
        ats_raw = compute_ats_score(
            refined_resume=improved_data,
            job_keywords=job_keywords,
            keyword_match_percentage=final_match,
            missing_keywords=kw_analysis.non_injectable_keywords if kw_analysis else [],
            injectable_keywords=kw_analysis.injectable_keywords if kw_analysis else [],
        )
        return ATSScore(
            overall_score=ats_raw["overall_score"],
            sub_scores=ATSSubScores(**ats_raw["sub_scores"]),
            missing_keywords=ats_raw["missing_keywords"],
            injectable_keywords=ats_raw["injectable_keywords"],
            recommendations=ats_raw["recommendations"],
        )
    except Exception:
        logger.warning("ATS score computation failed", exc_info=True)
        return None


def calculate_diff_from_resume(
    resume: dict[str, Any],
    improved_data: dict[str, Any],
    original_data: dict[str, Any] | None = None,
) -> tuple[ResumeDiffSummary | None, list[ResumeFieldDiff] | None, str | None]:
    """Calculate resume diffs when structured data is available.

    ``original_data`` overrides the stored resume as the diff baseline (used when
    tailoring from a condensed source). Returns (summary, changes, error_reason).
    Error reason is None on success, or a string describing why diff calculation
    failed.
    """
    original_data = original_data or get_original_resume_data(resume)
    if not original_data:
        return None, None, "original_data_missing"
    from app.services.improver import calculate_resume_diff

    try:
        summary, changes = calculate_resume_diff(original_data, improved_data)
        return summary, changes, None
    except Exception as e:
        logger.warning("Skipping resume diff due to calculation failure: %s", e)
        return None, None, "calculation_error"


async def generate_auxiliary_messages(
    improved_data: dict[str, Any],
    job_content: str,
    language: str,
    enable_cover_letter: bool,
    enable_outreach: bool,
    enable_interview_prep: bool,
    forced_keywords: list[str] | None = None,
) -> tuple[str | None, str | None, str | None, InterviewPrepData | None, list[str]]:
    """Generate cover letter, outreach, interview prep, and resume title.

    Returns (cover_letter, outreach_message, title, interview_prep, warnings).
    """
    cover_letter = None
    outreach_message = None
    title = None
    interview_prep = None
    warnings: list[str] = []
    # Finish optional work before the operation deadline so successful outputs
    # can still be persisted if one provider call stalls. The remaining slice is
    # reserved for the resume/improvement transaction.
    generation_timeout = max(0.001, remaining_timeout() * 0.8)
    generation_tasks: list[Awaitable[str | InterviewPrepData]] = []
    task_labels: list[str] = []

    # Title generation is always on (no feature flag)
    generation_tasks.append(generate_resume_title(job_content, language))
    task_labels.append("title")

    if enable_cover_letter:
        generation_tasks.append(
            generate_cover_letter(improved_data, job_content, language)
        )
        task_labels.append("cover_letter")
    if enable_outreach:
        generation_tasks.append(
            generate_outreach_message(improved_data, job_content, language)
        )
        task_labels.append("outreach")
    if enable_interview_prep:
        generation_tasks.append(
            generate_interview_prep(
                improved_data, job_content, language, forced_keywords=forced_keywords
            )
        )
        task_labels.append("interview_prep")

    async def bounded_generation(
        generation: Awaitable[str | InterviewPrepData],
    ) -> str | InterviewPrepData:
        return await asyncio.wait_for(generation, timeout=generation_timeout)

    results = await asyncio.gather(
        *(bounded_generation(task) for task in generation_tasks),
        return_exceptions=True,
    )
    for label, result in zip(task_labels, results):
        if isinstance(result, (AIOperationDeadlineExceeded, PromptSizeError)):
            raise result
        if isinstance(result, Exception):
            logger.warning(
                "%s generation failed: %s",
                label,
                result,
                exc_info=result,
            )
            warnings.append(f"{label.replace('_', ' ').title()} generation failed")
        else:
            if label != "interview_prep" and (
                not isinstance(result, str) or not result.strip()
            ):
                logger.warning("%s generation returned empty output", label)
                warnings.append(f"{label.replace('_', ' ').title()} generation failed")
                continue
            if label == "title":
                title = result.strip()
            elif label == "cover_letter":
                cover_letter = result.strip()
            elif label == "outreach":
                outreach_message = result.strip()
            elif label == "interview_prep":
                interview_prep = result

    return cover_letter, outreach_message, title, interview_prep, warnings


async def improve_preview_flow(
    *,
    request: ImproveResumeRequest,
    resume: dict[str, Any],
    job: dict[str, Any],
    language: str,
    prompt_id: str,
    progress: dict[str, str] | None = None,
) -> ImproveResumeResponse:
    """Inner flow for improve/preview, extracted so it can be wrapped in wait_for."""
    if progress is None:
        progress = {}
    progress["stage"] = "load_job_keywords"
    job_keywords = job.get("job_keywords")
    job_keywords_hash = job.get("job_keywords_hash")
    content_hash = hash_job_content(job["content"])
    if not job_keywords or job_keywords_hash != content_hash:
        job_keywords = await extract_job_keywords(job["content"])
        await _cache_job_keywords(request.job_id, content_hash, job_keywords)
    progress["stage"] = "load_original_resume"
    original_resume_data = get_original_resume_data(resume)
    # Collect warnings throughout the process
    response_warnings: list[str] = []
    allow_appended_rows = False

    source_content = resume["content"]
    bullet_selection = None
    if original_resume_data and (
        request.max_bullets_per_entry is not None or request.page_fit is not None
    ):
        progress["stage"] = "select_bullets"
        selection = await run_bullet_selection(
            source_data=original_resume_data,
            job_description=job["content"],
            job_keywords=job_keywords,
            max_per_entry=request.max_bullets_per_entry,
            page_fit=request.page_fit,
            max_pages=request.max_pages,
        )
        # The condensed, fitted source replaces the full master for every
        # downstream step so preservation contracts hold at confirm time.
        original_resume_data = selection.data
        source_content = json.dumps(original_resume_data, ensure_ascii=False)
        bullet_selection = selection.summary
        response_warnings.extend(selection.warnings)
    # Rewriting must not add bullets to the entries whose bullet set was chosen.
    fixed_row_sections = SELECTABLE_SECTIONS if bullet_selection is not None else ()

    # Diff-based improvement: generate targeted changes, apply with verification
    if original_resume_data:
        skill_targets: list[dict[str, Any]] = []
        try:
            progress["stage"] = "plan_skill_targets"
            raw_skill_plan = await generate_skill_target_plan(
                original_resume_data=original_resume_data,
                job_description=job["content"],
                job_keywords=job_keywords,
                language=language,
            )
            verified_skill_plan = verify_skill_target_plan(
                raw_skill_plan,
                original_resume_data=original_resume_data,
                job_keywords=job_keywords,
                job_description=job["content"],
            )
            accepted_targets = verified_skill_plan.get("accepted", [])
            if isinstance(accepted_targets, list):
                skill_targets = [
                    target for target in accepted_targets if isinstance(target, dict)
                ]
            rejected_targets = verified_skill_plan.get("rejected", [])
            if isinstance(rejected_targets, list) and rejected_targets:
                response_warnings.append(
                    f"{len(rejected_targets)} unsupported skill target(s) rejected"
                )
        except (AIOperationDeadlineExceeded, PromptSizeError):
            raise
        except Exception as e:
            logger.warning("Skill target planning failed, continuing without it: %s", e)
            response_warnings.append("Skill target planning failed")

        progress["stage"] = "generate_resume_diffs"
        diff_result = await generate_resume_diffs(
            original_resume=source_content,
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            original_resume_data=original_resume_data,
            skill_targets=skill_targets,
            fixed_row_sections=fixed_row_sections,
        )

        progress["stage"] = "apply_resume_diffs"
        improved_data, applied_changes, rejected_changes = apply_diffs(
            original=original_resume_data,
            changes=diff_result.changes,
            allowed_skill_targets=skill_targets,
            fixed_row_sections=fixed_row_sections,
            allow_bullet_reorder=prompt_id == "heavy",
        )
        allow_appended_rows = any(
            change.action == "append" for change in applied_changes
        )

        diff_warnings = verify_diff_result(
            original=original_resume_data,
            result=improved_data,
            applied_changes=applied_changes,
            job_keywords=job_keywords,
        )
        response_warnings.extend(diff_warnings)

        # An append refused on a harness-chosen bullet set is expected (and logged by
        # apply_diffs); only other rejections are worth a user-facing warning.
        unexpected_rejections = [
            change
            for change in rejected_changes
            if not is_fixed_row_append(change, fixed_row_sections)
        ]
        if unexpected_rejections:
            response_warnings.append(
                f"{len(unexpected_rejections)} change(s) rejected during verification"
            )

        logger.info(
            "Diff-based improve: %d applied, %d rejected, %d warnings",
            len(applied_changes),
            len(rejected_changes),
            len(diff_warnings),
        )
    else:
        # Fallback to full-output mode when no structured data available
        progress["stage"] = "generate_resume"
        improved_data = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            original_resume_data=original_resume_data,
        )

    progress["stage"] = "preserve_source_fields"
    # Safety nets (defense in depth — should rarely activate with diff-based flow)
    improved_data, preserve_warnings = preserve_personal_info(
        original_resume_data,
        improved_data,
    )
    response_warnings.extend(preserve_warnings)

    improved_data = restore_original_dates(original_resume_data, improved_data)
    original_markdown = _get_original_markdown(resume)
    if original_markdown:
        improved_data = restore_dates_from_markdown(improved_data, original_markdown)
    improved_data = preserve_original_skills(original_resume_data, improved_data)
    improved_data = protect_custom_sections(original_resume_data, improved_data)

    # Multi-pass refinement: keyword injection, AI phrase removal, alignment validation
    refinement_stats: RefinementStats | None = None
    refinement_result = None
    refinement_attempted = False
    refinement_successful = False
    try:
        # Get master resume for alignment validation
        master_data = await grounding_master_data(resume)
        if master_data:
            initial_match = calculate_keyword_match(improved_data, job_keywords)
            refinement_attempted = True
            progress["stage"] = "refine_resume"
            refinement_result = await refine_resume(
                initial_tailored=improved_data,
                master_resume=master_data,
                job_description=job["content"],
                job_keywords=job_keywords,
                config=RefinementConfig(),
                fixed_row_sections=fixed_row_sections,
            )
            improved_data = refinement_result.refined_data
            refinement_stats = refinement_result.to_stats(initial_match)
            refinement_successful = True
            logger.info(
                "Refinement completed: %d passes, %d AI phrases removed",
                refinement_result.passes_completed,
                len(refinement_result.ai_phrases_removed),
            )
    except (AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.warning("Refinement failed, using unrefined result: %s", e)
        if refinement_attempted:
            response_warnings.append(REFINEMENT_FAILED_WARNING)

    improved_data, writing = await _run_tailor_writing_loop(
        improved_data, language, prompt_id, progress
    )

    if original_resume_data:
        improved_data = finalize_ai_resume(
            original_resume_data,
            improved_data,
            allow_appended_rows=allow_appended_rows,
            fixed_row_sections=fixed_row_sections,
        )
        response_warnings.extend(
            grounding_review_warnings(original_resume_data, improved_data)
        )
        if refinement_stats is not None and refinement_result is not None:
            refinement_stats = _finalized_refinement_stats(
                refinement_stats,
                refinement_result.keywords_applied,
                improved_data,
                job_keywords,
            )

    if (
        bullet_selection is not None
        and request.page_fit is not None
        and bullet_selection.page_fit in ("fits", "trimmed")
    ):
        progress["stage"] = "final_page_check"
        final_pages = await final_page_check(improved_data, request.page_fit)
        bullet_selection.final_check = "skipped" if final_pages is None else "ok"
        if final_pages is not None:
            bullet_selection.final_pages = final_pages
            limit = page_limit(request.page_fit, request.max_pages)
            if limit is not None and final_pages > limit:
                response_warnings.append(PAGE_FIT_FINAL_OVER_WARNING)

    progress["stage"] = "register_preview"
    improved_text = json.dumps(improved_data, indent=2)
    preview_hash = hash_improved_data(improved_data)
    improvements = generate_improvements(job_keywords)
    registered_preview = await db.register_preview(
        source_id=request.resume_id,
        job_id=request.job_id,
        payload_hash=preview_hash,
        source_hash=resume_fingerprint(
            resume["content"],
            resume.get("processed_data"),
            resume.get("original_markdown"),
        ),
        job_hash=job_fingerprint(job["content"]),
        prompt_id=prompt_id,
        ttl_seconds=settings.preview_ttl_seconds,
        improvements=improvements,
        source_data=original_resume_data if bullet_selection is not None else None,
    )
    progress["stage"] = "calculate_diff"
    diff_summary, detailed_changes, diff_error = calculate_diff_from_resume(
        resume,
        improved_data,
        original_resume_data,
    )
    if diff_error:
        response_warnings.append(DIFF_UNAVAILABLE_WARNING)

    request_id = str(uuid4())
    progress["stage"] = "serialize_preview"
    return ImproveResumeResponse(
        request_id=request_id,
        data=ImproveResumeData(
            request_id=request_id,
            resume_id=None,
            preview_id=registered_preview["preview_id"],
            preview_expires_at=registered_preview["expires_at"],
            job_id=request.job_id,
            resume_preview=ResumeData.model_validate(improved_data),
            improvements=[
                {
                    "suggestion": imp["suggestion"],
                    "lineNumber": imp.get("lineNumber"),
                }
                for imp in improvements
            ],
            markdownOriginal=resume["content"],
            markdownImproved=improved_text,
            cover_letter=None,
            outreach_message=None,
            interview_prep=None,
            diff_summary=diff_summary,
            detailed_changes=detailed_changes,
            refinement_stats=refinement_stats,
            ats_score=_build_ats_score(
                improved_data,
                job_keywords,
                refinement_result,
                refinement_successful,
            ),
            bullet_selection=bullet_selection,
            writing=finalized_writing_report(
                writing, improved_data, language, original_resume_data
            ),
            warnings=response_warnings,
            refinement_attempted=refinement_attempted,
            refinement_successful=refinement_successful,
        ),
    )


async def _run_tailor_writing_loop(
    improved_data: dict[str, Any],
    language: str,
    prompt_id: str,
    progress: dict[str, str] | None = None,
) -> tuple[dict[str, Any], WritingReport | None]:
    """Critique the tailored resume; rewrite hard findings unless Light nudge.

    A failure keeps the tailored resume as it was (the report is then None).
    """
    try:
        loop = await run_writing_loop(
            improved_data,
            language=language,
            rewrite=prompt_id != "nudge",
            heavy=prompt_id == "heavy",
            progress=progress,
        )
        return loop.data, loop.report
    except (AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.warning("Writing loop failed, keeping the tailored text: %s", e)
        return improved_data, None


async def execute_tailoring_pipeline(
    resume_id: str,
    job_id: str,
    prompt_id: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], str, dict[str, Any]]:
    """Core tailoring pipeline for a single resume and job description.

    Returns:
        (tailored_resume, improved_data, improvements, request_id, extra_meta)
    """
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    feature_config = _load_config()
    enable_cover_letter = feature_config.get("enable_cover_letter", False)
    enable_outreach = feature_config.get("enable_outreach_message", False)
    enable_interview_prep = feature_config.get("enable_interview_prep", False)
    validate_ai_sources(resume, job)
    language = get_content_language()

    # Extract keywords from job description; the cache lets the ATS score be
    # recalculated from the builder later.
    job_keywords = await extract_job_keywords(job["content"])
    # The refreshed job carries the extracted company/role for the tracker card.
    job = (
        await _cache_job_keywords(
            job_id, hash_job_content(job["content"]), job_keywords
        )
        or job
    )

    effective_prompt_id = prompt_id or get_default_prompt_id()
    original_resume_data = get_original_resume_data(resume)
    response_warnings: list[str] = []
    allow_appended_rows = False

    # Diff-based improvement: generate targeted changes, apply with verification
    if original_resume_data:
        diff_result = await generate_resume_diffs(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=effective_prompt_id,
            original_resume_data=original_resume_data,
        )

        improved_data, applied_changes, rejected_changes = apply_diffs(
            original=original_resume_data,
            changes=diff_result.changes,
            allow_bullet_reorder=effective_prompt_id == "heavy",
        )
        allow_appended_rows = any(
            change.action == "append" for change in applied_changes
        )

        diff_warnings = verify_diff_result(
            original=original_resume_data,
            result=improved_data,
            applied_changes=applied_changes,
            job_keywords=job_keywords,
        )
        response_warnings.extend(diff_warnings)

        if rejected_changes:
            response_warnings.append(
                f"{len(rejected_changes)} change(s) rejected during verification"
            )

        logger.info(
            "Diff-based improve: %d applied, %d rejected, %d warnings",
            len(applied_changes),
            len(rejected_changes),
            len(diff_warnings),
        )
    else:
        # Fallback to full-output mode when no structured data available
        improved_data = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=effective_prompt_id,
            original_resume_data=original_resume_data,
        )

    # Safety nets (defense in depth)
    improved_data, preserve_warnings = preserve_personal_info(
        original_resume_data,
        improved_data,
    )
    response_warnings.extend(preserve_warnings)

    improved_data = restore_original_dates(original_resume_data, improved_data)
    original_markdown = _get_original_markdown(resume)
    if original_markdown:
        improved_data = restore_dates_from_markdown(improved_data, original_markdown)
    improved_data = preserve_original_skills(original_resume_data, improved_data)
    improved_data = protect_custom_sections(original_resume_data, improved_data)

    # Multi-pass refinement: keyword injection, AI phrase removal, alignment validation
    refinement_stats: RefinementStats | None = None
    refinement_result = None
    refinement_attempted = False
    refinement_successful = False
    try:
        master_data = await grounding_master_data(resume)
        if master_data:
            initial_match = calculate_keyword_match(improved_data, job_keywords)
            refinement_attempted = True
            refinement_result = await refine_resume(
                initial_tailored=improved_data,
                master_resume=master_data,
                job_description=job["content"],
                job_keywords=job_keywords,
                config=RefinementConfig(),
            )
            improved_data = refinement_result.refined_data
            refinement_stats = refinement_result.to_stats(initial_match)
            refinement_successful = True
            logger.info(
                "Refinement completed: %d passes, %d AI phrases removed",
                refinement_result.passes_completed,
                len(refinement_result.ai_phrases_removed),
            )
    except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.warning("Refinement failed, using unrefined result: %s", e)
        if refinement_attempted:
            response_warnings.append(REFINEMENT_FAILED_WARNING)

    improved_data, _writing = await _run_tailor_writing_loop(
        improved_data, language, effective_prompt_id
    )

    if original_resume_data:
        improved_data = finalize_ai_resume(
            original_resume_data,
            improved_data,
            allow_review_claims=False,
            allow_appended_rows=allow_appended_rows,
        )
        response_warnings.extend(
            grounding_review_warnings(original_resume_data, improved_data)
        )
        if refinement_stats is not None and refinement_result is not None:
            refinement_stats = _finalized_refinement_stats(
                refinement_stats,
                refinement_result.keywords_applied,
                improved_data,
                job_keywords,
            )

    improved_text = json.dumps(improved_data, indent=2)

    diff_summary, detailed_changes, diff_error = calculate_diff_from_resume(
        resume,
        improved_data,
    )
    if diff_error:
        response_warnings.append(DIFF_UNAVAILABLE_WARNING)

    improvements = generate_improvements(job_keywords)

    (
        cover_letter,
        outreach_message,
        title,
        interview_prep,
        aux_warnings,
    ) = await generate_auxiliary_messages(
        improved_data,
        job["content"],
        language,
        enable_cover_letter,
        enable_outreach,
        enable_interview_prep,
    )
    response_warnings.extend(aux_warnings)

    # Stored as the builder's last ATS score, as at preview confirmation.
    ats_record: dict[str, Any] | None = None
    try:
        ats_record = score_tailored_data(
            improved_data,
            job_keywords,
            await grounding_master_data(resume) or improved_data,
        )
    except Exception:
        logger.warning("ATS score at tailoring failed", exc_info=True)

    request_id = str(uuid4())
    tailored_resume = await db.create_tailored_resume(
        request_id=request_id,
        original_resume_id=resume_id,
        job_id=job_id,
        resume_fields={
            "content": improved_text,
            "content_type": "json",
            "filename": f"tailored_{resume.get('filename', 'resume')}",
            "is_master": False,
            "parent_id": resume_id,
            "processed_data": improved_data,
            "processing_status": "ready",
            "cover_letter": cover_letter,
            "outreach_message": outreach_message,
            "interview_prep": serialize_interview_prep(interview_prep),
            "title": title,
            "template_settings": copy.deepcopy(resume.get("template_settings")),
        },
        improvements=improvements,
        ats_score=ats_record,
    )

    await auto_create_tracker_application(
        job_id=job_id,
        tailored_resume_id=tailored_resume["resume_id"],
        master_resume_id=resume_id,
        job=job,
        title=title,
    )

    ats_score = _build_ats_score(
        improved_data,
        job_keywords,
        refinement_result,
        refinement_successful,
    )

    extra_meta = {
        "title": title,
        "cover_letter": cover_letter,
        "outreach_message": outreach_message,
        "interview_prep": interview_prep,
        "diff_summary": diff_summary,
        "detailed_changes": detailed_changes,
        "refinement_stats": refinement_stats,
        "ats_score": ats_score,
        "response_warnings": response_warnings,
        "refinement_attempted": refinement_attempted,
        "refinement_successful": refinement_successful,
        "improved_text": improved_text,
        "original_content": resume.get("content", ""),
    }

    return tailored_resume, improved_data, improvements, request_id, extra_meta


def score_tailored_data(
    tailored_data: dict[str, Any],
    job_keywords: dict[str, Any],
    master_data: dict[str, Any],
) -> dict[str, Any]:
    """Deterministic ATS score record ({score, calculated_at}) for tailored data."""
    gaps = analyze_keyword_gaps(job_keywords, tailored_data, master_data)
    raw = compute_ats_score(
        refined_resume=tailored_data,
        job_keywords=job_keywords,
        keyword_match_percentage=calculate_keyword_match(tailored_data, job_keywords),
        missing_keywords=gaps.non_injectable_keywords,
        injectable_keywords=gaps.injectable_keywords,
    )
    score = ATSScore(
        overall_score=raw["overall_score"],
        sub_scores=ATSSubScores(**raw["sub_scores"]),
        missing_keywords=raw["missing_keywords"],
        injectable_keywords=raw["injectable_keywords"],
        recommendations=raw["recommendations"],
    )
    return ATSScoreRecord(
        score=score, calculated_at=datetime.now(timezone.utc).isoformat()
    ).model_dump(mode="json")


def _normalize_personal_info_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value).strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    normalized = _normalize_payload(value)
    return json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )


def validate_confirm_payload(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
    *,
    allow_appended_rows: bool = False,
) -> None:
    if not original_data:
        logger.warning(
            "Skipping confirm payload validation; structured resume data unavailable."
        )
        return
    original_info = original_data.get("personalInfo")
    improved_info = improved_data.get("personalInfo")
    # JSON-008: Explicit null checks with clear error messages
    if original_info is None:
        raise ValueError("Original resume missing personalInfo")
    if improved_info is None:
        raise ValueError("Improved resume missing personalInfo")
    if not isinstance(original_info, dict):
        raise ValueError(
            f"Original personalInfo is not a dict: {type(original_info).__name__}"
        )
    if not isinstance(improved_info, dict):
        raise ValueError(
            f"Improved personalInfo is not a dict: {type(improved_info).__name__}"
        )
    fields = set(original_info.keys()) | set(improved_info.keys())
    mismatches = [
        field
        for field in sorted(fields)
        if _normalize_personal_info_value(original_info.get(field))
        != _normalize_personal_info_value(improved_info.get(field))
    ]
    if mismatches:
        raise ValueError(f"personalInfo fields changed: {', '.join(mismatches)}")
    preservation_violations = validate_confirmed_resume(
        original_data, improved_data, allow_appended_rows=allow_appended_rows
    )
    if preservation_violations:
        raise ValueError(
            "source preservation failed: " + ", ".join(preservation_violations)
        )


def cached_job_keywords(job: dict[str, Any]) -> dict[str, Any] | None:
    """Job keywords cached at tailoring time, or None when missing or stale."""
    keywords = job.get("job_keywords")
    if not keywords or job.get("job_keywords_hash") != hash_job_content(
        job.get("content", "")
    ):
        return None
    return keywords


def scorable_job_keywords(job: dict[str, Any]) -> dict[str, Any] | None:
    """Cached job keywords with at least one term to score against, else None.

    Extraction can return empty lists; such a dict is truthy but scores 0%.
    """
    keywords = cached_job_keywords(job)
    if keywords and any(term.strip() for term in job_keyword_terms(keywords)):
        return keywords
    return None
