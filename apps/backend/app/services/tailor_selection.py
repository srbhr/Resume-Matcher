"""Orchestrates harness bullet selection: score (LLM) -> select -> fit (code)."""

import asyncio
import logging
from dataclasses import dataclass, field
from time import monotonic
from typing import Any

from app.ai_budget import AIOperationDeadlineExceeded, remaining_timeout
from app.schemas.models import BulletSelectionSummary, PageFitSettings
from app.services.bullet_scoring import score_bullets
from app.services.bullet_selector import (
    PageFitStatus,
    PageMeasureError,
    count_bullets,
    fit_to_one_page,
    select_bullets,
)
from app.services.page_fit import measure_page_count

logger = logging.getLogger(__name__)

BULLET_SCORING_FALLBACK_WARNING = (
    "Bullet relevance scoring fell back to keyword matching"
)
PAGE_FIT_OVER_WARNING = "Resume still exceeds one page at one bullet per role"
PAGE_FIT_UNAVAILABLE_WARNING = "Page fit skipped: the resume could not be rendered"
PAGE_FIT_FINAL_OVER_WARNING = (
    "Tailored resume may run slightly over one page after rewriting"
)
# Operation budget held back from every page render for the stages that follow it.
FINAL_CHECK_RESERVE_SECONDS = 10
# Page fit may spend at most min(ceiling, share of the remaining budget) rendering,
# so the LLM stages after it keep their budget on slow machines.
PAGE_FIT_TOTAL_BUDGET_SECONDS = 60
PAGE_FIT_BUDGET_SHARE = 0.25


@dataclass
class SelectionOutcome:
    data: dict[str, Any]
    summary: BulletSelectionSummary
    warnings: list[str] = field(default_factory=list)


async def run_bullet_selection(
    *,
    source_data: dict[str, Any],
    job_description: str,
    job_keywords: dict[str, Any],
    max_per_entry: int,
    page_fit: PageFitSettings | None,
) -> SelectionOutcome:
    scores, scoring = await score_bullets(source_data, job_description, job_keywords)
    selection = select_bullets(source_data, scores, max_per_entry)
    warnings: list[str] = []
    if scoring == "keyword_fallback":
        warnings.append(BULLET_SCORING_FALLBACK_WARNING)
    data = selection.data
    status: PageFitStatus = "skipped"
    trimmed = 0
    pages: int | None = None
    if page_fit is not None:
        fit_deadline = _page_fit_deadline()

        async def measure(draft: dict[str, Any]) -> int:
            return await _measure_within_budget(
                draft, page_fit, fit_deadline=fit_deadline
            )

        fit = await fit_to_one_page(selection.data, selection.scores, measure)
        data, status, trimmed, pages = fit.data, fit.status, fit.trimmed, fit.pages
        if status == "over":
            warnings.append(PAGE_FIT_OVER_WARNING)
        elif status == "unavailable":
            warnings.append(PAGE_FIT_UNAVAILABLE_WARNING)
    summary = BulletSelectionSummary(
        max_per_entry=max_per_entry,
        bullets_before=selection.bullets_before,
        bullets_after=count_bullets(data),
        trimmed_for_fit=trimmed,
        scoring=scoring,
        page_fit=status,
        final_pages=pages,
    )
    return SelectionOutcome(data=data, summary=summary, warnings=warnings)


def _page_fit_deadline() -> float:
    """Monotonic time at which page fit stops rendering, fixed when fitting starts."""
    try:
        share = remaining_timeout() * PAGE_FIT_BUDGET_SHARE
    except AIOperationDeadlineExceeded:
        share = 0.0
    return monotonic() + min(PAGE_FIT_TOTAL_BUDGET_SECONDS, share)


async def _measure_within_budget(
    data: dict[str, Any],
    page_fit: PageFitSettings,
    fit_deadline: float | None = None,
) -> int:
    """Render inside the operation budget, holding back the reserve for later stages.

    Raises PageMeasureError when no budget is left or the render outlives it, so
    a slow render degrades page fit instead of failing the whole operation.
    ``fit_deadline`` also bounds the render by page fit's total time cap.
    """
    try:
        budget = remaining_timeout() - FINAL_CHECK_RESERVE_SECONDS
    except AIOperationDeadlineExceeded as e:
        raise PageMeasureError("No operation budget left to render the draft") from e
    if fit_deadline is not None:
        fit_left = fit_deadline - monotonic()
        if fit_left <= 0:
            raise PageMeasureError("Page-fit render time cap spent")
        budget = min(budget, fit_left)
    if budget <= 0:
        raise PageMeasureError("No operation budget left to render the draft")
    try:
        return await asyncio.wait_for(measure_page_count(data, page_fit), budget)
    except AIOperationDeadlineExceeded:
        raise  # a TimeoutError subclass, but it ends the operation, not just the render
    except TimeoutError as e:
        logger.warning("Draft page measurement exceeded its %.2fs budget", budget)
        raise PageMeasureError("Draft render exceeded the operation budget") from e


async def final_page_check(
    data: dict[str, Any], page_fit: PageFitSettings
) -> int | None:
    """Page count of the rewritten result; None when it cannot be rendered in budget."""
    try:
        return await _measure_within_budget(data, page_fit)
    except PageMeasureError as e:
        logger.warning("Final page check skipped: %s", e)
        return None
