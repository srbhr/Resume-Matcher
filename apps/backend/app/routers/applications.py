"""Kanban application-tracker endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException

from app.database import db
from app.services.improver import extract_job_keywords
from app.schemas import (
    APPLICATION_STATUS_ORDER,
    ApplicationActionResponse,
    ApplicationDetailResponse,
    ApplicationListResponse,
    ApplicationResponse,
    ApplicationUpdate,
    BulkDelete,
    BulkStatusUpdate,
    ManualApplicationCreate,
    TrackerColumnCreate,
    TrackerColumnDelete,
    TrackerColumnResponse,
    TrackerColumnUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applications", tags=["Application Tracker"])


def _group_by_status(
    applications: list[dict[str, Any]], column_ids: set[str]
) -> dict[str, list[ApplicationResponse]]:
    """Group a flat list into configured columns (all keys always present).

    A row with an unknown status can't be represented by the enum-backed
    ``ApplicationResponse``; rather than 500 the whole board we skip it (the
    board only renders the seven known columns) and log it.
    """
    columns: dict[str, list[ApplicationResponse]] = {column_id: [] for column_id in column_ids}
    for app in applications:
        status = app.get("status")
        if status not in column_ids:
            logger.warning("Skipping application with unknown status %r", status)
            continue
        columns[status].append(ApplicationResponse(**app))
    return columns


@router.get("", response_model=ApplicationListResponse)
async def list_applications() -> ApplicationListResponse:
    """List all applications grouped by status column."""
    try:
        applications = await db.list_applications()
        column_definitions = await db.list_tracker_columns()
    except Exception as e:
        logger.error("Failed to list applications: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load applications. Please try again.")
    column_ids = {column["column_id"] for column in column_definitions}
    columns = _group_by_status(applications, column_ids)
    return ApplicationListResponse(
        columns=columns,
        column_definitions=[TrackerColumnResponse(**column) for column in column_definitions],
    )


async def _column_ids() -> set[str]:
    """Return currently configured tracker column keys."""
    return {column["column_id"] for column in await db.list_tracker_columns()}


@router.get("/columns", response_model=list[TrackerColumnResponse])
async def list_tracker_columns() -> list[TrackerColumnResponse]:
    """List tracker columns in board order."""
    return [TrackerColumnResponse(**column) for column in await db.list_tracker_columns()]


@router.post("/columns", response_model=TrackerColumnResponse)
async def create_tracker_column(request: TrackerColumnCreate) -> TrackerColumnResponse:
    """Create a custom tracker column."""
    label = request.label.strip()
    if not label:
        raise HTTPException(status_code=422, detail="Column label cannot be empty")
    existing_labels = {
        column["label"].casefold() for column in await db.list_tracker_columns()
    }
    if label.casefold() in existing_labels:
        raise HTTPException(status_code=409, detail="Column label already exists")
    return TrackerColumnResponse(**(await db.create_tracker_column(label)))


@router.patch("/columns/{column_id}", response_model=TrackerColumnResponse)
async def update_tracker_column(
    column_id: str, request: TrackerColumnUpdate
) -> TrackerColumnResponse:
    """Rename, reorder, or change visibility for a tracker column."""
    column = await db.get_tracker_column(column_id)
    if column is None:
        raise HTTPException(status_code=404, detail="Tracker column not found")
    updates = request.model_dump(exclude_unset=True)
    if column["is_system"] and "label" in updates:
        raise HTTPException(status_code=400, detail="Built-in columns cannot be renamed")
    if updates.get("label") is not None:
        updates["label"] = updates["label"].strip()
        if not updates["label"]:
            raise HTTPException(status_code=422, detail="Column label cannot be empty")
        existing_labels = {
            item["label"].casefold()
            for item in await db.list_tracker_columns()
            if item["column_id"] != column_id
        }
        if updates["label"].casefold() in existing_labels:
            raise HTTPException(status_code=409, detail="Column label already exists")
    if updates.get("is_hidden") is True:
        visible = [item for item in await db.list_tracker_columns() if not item["is_hidden"]]
        if len(visible) <= 1 and not column["is_hidden"]:
            raise HTTPException(status_code=400, detail="At least one column must stay visible")
    updated = await db.update_tracker_column(column_id, updates)
    assert updated is not None
    return TrackerColumnResponse(**updated)


@router.delete("/columns/{column_id}", response_model=ApplicationActionResponse)
async def delete_tracker_column(
    column_id: str, request: TrackerColumnDelete
) -> ApplicationActionResponse:
    """Delete a custom column and move its cards to another column."""
    column = await db.get_tracker_column(column_id)
    destination = await db.get_tracker_column(request.destination_id)
    if column is None or destination is None:
        raise HTTPException(status_code=404, detail="Tracker column not found")
    if column["is_system"]:
        raise HTTPException(status_code=400, detail="Built-in columns cannot be deleted")
    if not await db.delete_tracker_column(column_id, request.destination_id):
        raise HTTPException(status_code=400, detail="Could not delete tracker column")
    return ApplicationActionResponse(message="Tracker column deleted", affected=1)


@router.post("", response_model=ApplicationResponse)
async def create_application(request: ManualApplicationCreate) -> ApplicationResponse:
    """Manually add a card from a pasted job description.

    Creates the job, runs a best-effort company/role extraction when not
    provided, then creates the application. If application creation fails the
    just-created job is cleaned up (no orphan jobs / retry drift); caching
    company/role on the job is best-effort and never fails the request.
    """
    if request.status not in await _column_ids():
        raise HTTPException(status_code=422, detail="Unknown tracker column")
    job = await db.create_job(content=request.job_description, resume_id=request.resume_id)

    company = request.company
    role = request.role
    if not company or not role:
        extracted = await _extract_company_role(request.job_description)
        company = company or extracted.get("company")
        role = role or extracted.get("role")

    try:
        application = await db.create_application(
            job_id=job["job_id"],
            resume_id=request.resume_id,
            status=request.status,
            company=company,
            role=role,
            notes=request.notes,
        )
    except Exception as e:
        logger.error("Failed to create application: %s", e)
        try:
            await db.delete_job(job["job_id"])
        except Exception as cleanup_error:
            logger.warning("Failed to clean up orphan job %s: %s", job["job_id"], cleanup_error)
        raise HTTPException(status_code=500, detail="Failed to create application. Please try again.")

    # Best-effort: cache company/role on the job for later reuse — never 500.
    if company or role:
        try:
            await db.update_job(job["job_id"], {"company": company, "role": role})
        except Exception as e:
            logger.warning("Failed to cache company/role on job %s: %s", job["job_id"], e)

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
    except Exception as e:
        # Detail is best-effort beyond the card itself; never 500 the modal.
        logger.warning("Failed to load detail context for %s: %s", application_id, e)

    return ApplicationDetailResponse(**application, job_content=job_content, resume=resume)


@router.patch("/bulk", response_model=ApplicationActionResponse)
async def bulk_update_applications(request: BulkStatusUpdate) -> ApplicationActionResponse:
    """Move many cards to one column."""
    try:
        if request.status not in await _column_ids():
            raise HTTPException(status_code=422, detail="Unknown tracker column")
        moved = await db.bulk_update_applications(request.application_ids, request.status)
    except Exception as e:
        logger.error("Failed to bulk-update applications: %s", e)
        raise HTTPException(status_code=500, detail="Failed to move applications. Please try again.")
    return ApplicationActionResponse(message=f"Moved {moved} application(s)", affected=moved)


@router.patch("/{application_id}", response_model=ApplicationResponse)
async def update_application(application_id: str, request: ApplicationUpdate) -> ApplicationResponse:
    """Update a card (status/position/notes/company/role/applied_at)."""
    updates = request.model_dump(exclude_unset=True)
    # Normalize the enum to its stable string value for the data layer.
    if "status" in updates and updates["status"] is not None:
        if updates["status"] not in await _column_ids():
            raise HTTPException(status_code=422, detail="Unknown tracker column")
    try:
        updated = await db.update_application(application_id, updates)
    except Exception as e:
        logger.error("Failed to update application %s: %s", application_id, e)
        raise HTTPException(status_code=500, detail="Failed to update application. Please try again.")
    if updated is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return ApplicationResponse(**updated)


@router.delete("/{application_id}", response_model=ApplicationActionResponse)
async def delete_application(application_id: str) -> ApplicationActionResponse:
    """Delete a card."""
    try:
        deleted = await db.delete_application(application_id)
    except Exception as e:
        logger.error("Failed to delete application %s: %s", application_id, e)
        raise HTTPException(status_code=500, detail="Failed to delete application. Please try again.")
    if not deleted:
        raise HTTPException(status_code=404, detail="Application not found")
    return ApplicationActionResponse(message="Application deleted", affected=1)


@router.post("/bulk-delete", response_model=ApplicationActionResponse)
async def bulk_delete_applications(request: BulkDelete) -> ApplicationActionResponse:
    """Delete many cards."""
    try:
        deleted = await db.bulk_delete_applications(request.application_ids)
    except Exception as e:
        logger.error("Failed to bulk-delete applications: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete applications. Please try again.")
    return ApplicationActionResponse(message=f"Deleted {deleted} application(s)", affected=deleted)


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
            "company": (raw_company.strip() if isinstance(raw_company, str) else "") or None,
            "role": (raw_role.strip() if isinstance(raw_role, str) else "") or None,
        }
    except Exception as e:
        logger.warning("Company/role extraction failed (manual add): %s", e)
        return {}
