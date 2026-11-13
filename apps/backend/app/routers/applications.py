"""Kanban application-tracker endpoints."""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from app.ai_budget import AIOperationDeadlineExceeded, AIOperationRoute
from app.ai_limits import MAX_JOB_CHARACTERS, PromptSizeError, require_source_size
from app.config_cache import get_content_language
from app.database import DatabaseBusyError, db
from app.schemas import (
    APPLICATION_STATUS_ORDER,
    ApplicationActionResponse,
    ApplicationDetailResponse,
    ApplicationListResponse,
    ApplicationResponse,
    ApplicationUpdate,
    BulkDelete,
    BulkStatusUpdate,
    GenerateContentResponse,
    ManualApplicationCreate,
)
from app.services.cover_letter import generate_follow_up_email
from app.services.improver import extract_job_keywords

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applications", tags=["Application Tracker"])
# Model-backed card actions share the AI operation budget: 504 on timeout and
# 422 on oversized input, like the other AI endpoints. Card CRUD stays on the
# plain router.
ai_router = APIRouter(
    route_class=AIOperationRoute, prefix="/applications", tags=["Application Tracker"]
)


def _group_by_status(
    applications: list[dict[str, Any]],
) -> dict[str, list[ApplicationResponse]]:
    """Group a flat list into the seven columns (all keys always present).

    A row with an unknown status can't be represented by the enum-backed
    ``ApplicationResponse``; rather than 500 the whole board we skip it (the
    board only renders the seven known columns) and log it.
    """
    columns: dict[str, list[ApplicationResponse]] = {
        s: [] for s in APPLICATION_STATUS_ORDER
    }
    for app in applications:
        status = app.get("status")
        if status not in columns:
            logger.warning("Skipping application with unknown status %r", status)
            continue
        columns[status].append(ApplicationResponse(**app))
    return columns


@router.get("", response_model=ApplicationListResponse)
async def list_applications() -> ApplicationListResponse:
    """List all applications grouped by status column."""
    try:
        applications = await db.list_applications()
    except DatabaseBusyError:
        raise
    except Exception as e:
        logger.error("Failed to list applications: %s", e)
        raise HTTPException(
            status_code=500, detail="Failed to load applications. Please try again."
        )
    return ApplicationListResponse(columns=_group_by_status(applications))


@router.post("", response_model=ApplicationResponse)
async def create_application(request: ManualApplicationCreate) -> ApplicationResponse:
    """Manually add a card from a pasted job description.

    Runs best-effort company/role extraction before opening a transaction, then
    commits the pasted job, its metadata and the card as one operation.
    """
    company = request.company
    role = request.role
    if not company or not role:
        extracted = await _extract_company_role(request.job_description)
        company = company or extracted.get("company")
        role = role or extracted.get("role")

    try:
        application = await db.create_manual_application(
            content=request.job_description,
            resume_id=request.resume_id,
            status=request.status.value,
            company=company,
            role=role,
            notes=request.notes,
        )
    except DatabaseBusyError:
        raise
    except Exception as e:
        logger.exception("Failed to create manual application")
        raise HTTPException(
            status_code=500,
            detail="Failed to create application. Please try again.",
        ) from e

    return ApplicationResponse(**application)


@router.get("/{application_id}", response_model=ApplicationDetailResponse)
async def get_application_detail(application_id: str) -> ApplicationDetailResponse:
    """Get a card with its embedded JD and applied resume (one round-trip).

    Tolerates a deleted resume by returning ``resume: null`` rather than 500.
    """
    application = await db.get_application(application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")

    job_content: str | None = None
    resume: dict[str, Any] | None = None
    try:
        job = await db.get_job(application["job_id"])
        if job:
            job_content = job.get("content")
        resume = await db.get_resume(application["resume_id"])
    except DatabaseBusyError:
        raise
    except Exception as e:
        # Detail is best-effort beyond the card itself; never 500 the modal.
        logger.warning("Failed to load detail context for %s: %s", application_id, e)

    return ApplicationDetailResponse(
        **application, job_content=job_content, resume=resume
    )


@router.patch("/bulk", response_model=ApplicationActionResponse)
async def bulk_update_applications(
    request: BulkStatusUpdate,
) -> ApplicationActionResponse:
    """Move many cards to one column."""
    try:
        moved = await db.bulk_update_applications(
            request.application_ids, request.status.value
        )
    except DatabaseBusyError:
        raise
    except Exception as e:
        logger.error("Failed to bulk-update applications: %s", e)
        raise HTTPException(
            status_code=500, detail="Failed to move applications. Please try again."
        )
    return ApplicationActionResponse(
        message=f"Moved {moved} application(s)", affected=moved
    )


@router.patch("/{application_id}", response_model=ApplicationResponse)
async def update_application(
    application_id: str, request: ApplicationUpdate
) -> ApplicationResponse:
    """Update a card (status/position/notes/company/role/applied_at)."""
    updates = request.model_dump(exclude_unset=True)
    # Normalize the enum to its stable string value for the data layer.
    if "status" in updates and updates["status"] is not None:
        updates["status"] = request.status.value
    try:
        updated = await db.update_application(application_id, updates)
    except DatabaseBusyError:
        raise
    except Exception as e:
        logger.error("Failed to update application %s: %s", application_id, e)
        raise HTTPException(
            status_code=500, detail="Failed to update application. Please try again."
        )
    if updated is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return ApplicationResponse(**updated)


@router.delete("/{application_id}", response_model=ApplicationActionResponse)
async def delete_application(application_id: str) -> ApplicationActionResponse:
    """Delete a card."""
    try:
        deleted = await db.delete_application(application_id)
    except DatabaseBusyError:
        raise
    except Exception as e:
        logger.error("Failed to delete application %s: %s", application_id, e)
        raise HTTPException(
            status_code=500, detail="Failed to delete application. Please try again."
        )
    if not deleted:
        raise HTTPException(status_code=404, detail="Application not found")
    return ApplicationActionResponse(message="Application deleted", affected=1)


@router.post("/bulk-delete", response_model=ApplicationActionResponse)
async def bulk_delete_applications(request: BulkDelete) -> ApplicationActionResponse:
    """Delete many cards."""
    try:
        deleted = await db.bulk_delete_applications(request.application_ids)
    except DatabaseBusyError:
        raise
    except Exception as e:
        logger.error("Failed to bulk-delete applications: %s", e)
        raise HTTPException(
            status_code=500, detail="Failed to delete applications. Please try again."
        )
    return ApplicationActionResponse(
        message=f"Deleted {deleted} application(s)", affected=deleted
    )


# Statuses whose cards can still get a follow-up, matching the tracker UI.
_AWAITING_REPLY = ("applied", "no_response")


def _days_since(iso_timestamp: str | None, now: datetime) -> int | None:
    """Whole days from ``iso_timestamp`` to ``now``; None if missing or unreadable."""
    if not iso_timestamp:
        return None
    try:
        then = datetime.fromisoformat(iso_timestamp)
    except ValueError:
        return None
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    return max(0, (now - then).days)


@ai_router.post("/{application_id}/follow-up", response_model=GenerateContentResponse)
async def draft_follow_up(application_id: str) -> GenerateContentResponse:
    """Draft a follow-up email from the card's job, resume and applied date.

    The draft is returned for the user to edit and copy; nothing is saved.
    """
    application = await db.get_application(application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found")
    if application["status"] not in _AWAITING_REPLY:
        raise HTTPException(
            status_code=400,
            detail="Follow-ups are for applications still waiting on a reply.",
        )
    job = await db.get_job(application["job_id"])
    if job is None or not job.get("content"):
        raise HTTPException(
            status_code=400, detail="This application has no job description."
        )
    resume = await db.get_resume(application["resume_id"])
    resume_data = resume.get("processed_data") if resume else None
    if not resume_data:
        raise HTTPException(
            status_code=400, detail="This application's resume is unavailable."
        )
    require_source_size(job["content"], MAX_JOB_CHARACTERS)
    require_source_size(resume_data)

    try:
        content = await generate_follow_up_email(
            resume_data,
            job["content"],
            company=application.get("company"),
            role=application.get("role"),
            days_since_applied=_days_since(
                application.get("applied_at"), datetime.now(timezone.utc)
            ),
            language=get_content_language(),
        )
    except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.error("Follow-up email draft failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Failed to draft a follow-up email. Please try again.",
        )
    return GenerateContentResponse(
        content=content, message="Follow-up email drafted successfully"
    )


async def _extract_company_role(job_description: str) -> dict[str, str | None]:
    """Best-effort company/role extraction for the manual-add path.

    Reuses the cached keyword-extraction pass; falls back to blank (editable)
    on any failure so a flaky LLM never blocks card creation. LLM output isn't
    guaranteed to be a string, so values are type-guarded before ``.strip()``.
    """
    try:
        keywords = await extract_job_keywords(job_description)
        raw_company = keywords.get("company")
        raw_role = keywords.get("role")
        return {
            "company": (raw_company.strip() if isinstance(raw_company, str) else "")
            or None,
            "role": (raw_role.strip() if isinstance(raw_role, str) else "") or None,
        }
    except DatabaseBusyError:
        raise
    except Exception as e:
        logger.warning("Company/role extraction failed (manual add): %s", e)
        return {}
