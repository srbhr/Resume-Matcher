"""Writing quality for any resume: the code-rule check and the Improve writing action."""

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from app.ai_budget import (
    AIOperationDeadlineExceeded,
    AIOperationRoute,
    remaining_timeout,
)
from app.ai_limits import PromptSizeError, require_source_size
from app.config_cache import get_content_language
from app.schemas.models import ResumeData
from app.schemas.writing import (
    WritingChange,
    WritingCheckRequest,
    WritingImproveRequest,
    WritingImproveResponse,
)
from app.schemas.writing_report import WritingReport
from app.services.progress import tracked_progress
from app.services.resume_preservation import finalize_ai_resume
from app.services.writing_loop import finalized_writing_report, run_writing_loop
from app.services.writing_quality import iter_writing_units, writing_report

logger = logging.getLogger(__name__)

router = APIRouter(route_class=AIOperationRoute, prefix="/writing", tags=["Writing"])


def _changes(before: dict[str, Any], after: dict[str, Any]) -> list[WritingChange]:
    old = dict(iter_writing_units(before))
    return [
        WritingChange(path=path, before=old[path], after=text)
        for path, text in iter_writing_units(after)
        if path in old and old[path] != text
    ]


@router.post("/check", response_model=WritingReport)
async def check_writing_endpoint(request: WritingCheckRequest) -> WritingReport:
    """Score a resume's writing with the code rules (no AI call)."""
    return writing_report(request.resume_data.model_dump(), get_content_language())


@router.post("/improve", response_model=WritingImproveResponse)
async def improve_writing_endpoint(
    request: WritingImproveRequest,
) -> WritingImproveResponse:
    """Critique a resume and rewrite its weak lines, without adding facts.

    Works on unsaved Builder data and saves nothing: the client applies the
    result to its editor and saves through the normal update.
    """
    source = request.resume_data.model_dump()
    require_source_size(source)
    language = get_content_language()
    with tracked_progress(request.progress_id, "critique_writing") as progress:
        try:
            loop = await asyncio.wait_for(
                run_writing_loop(
                    source, language=language, progress=progress, raise_errors=True
                ),
                timeout=remaining_timeout(),
            )
        except (AIOperationDeadlineExceeded, PromptSizeError):
            raise
        except asyncio.TimeoutError as e:
            raise HTTPException(
                status_code=504,
                detail="Improving the writing timed out. Please try again.",
            ) from e
        except Exception as e:
            logger.error("Improve writing failed: %s", e)
            raise HTTPException(
                status_code=500,
                detail="Failed to improve the writing. Please try again.",
            ) from e
    improved = ResumeData.model_validate(
        finalize_ai_resume(source, loop.data)
    ).model_dump()
    return WritingImproveResponse(
        improved_data=ResumeData.model_validate(improved),
        writing=finalized_writing_report(loop.report, improved, language, source),
        changes=_changes(source, improved),
    )
