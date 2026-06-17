"""Resume scoring endpoints."""

import logging

from fastapi import APIRouter, HTTPException

from app.database import db
from app.schemas.scoring import ScoreRequest, ScoreResult
from app.services.scorer import score_resume

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scores", tags=["Scoring"])


@router.post("", response_model=ScoreResult)
async def create_score(request: ScoreRequest) -> ScoreResult:
    """Score a resume against a job description.

    Returns a cached result immediately if one exists for this resume-job pair.
    Otherwise runs the LLM scoring pipeline and caches the result.
    """
    result = await score_resume(request.resume_id, request.job_id, request.preferences)
    return ScoreResult(**result)


@router.get("/{resume_id}", response_model=ScoreResult | None)
async def get_latest_score_for_resume(resume_id: str) -> ScoreResult | None:
    """Return the most recent cached score for a resume, regardless of job.

    Returns null if no score has been computed for this resume yet.
    """
    results = await db.list_scores_by_resume(resume_id)
    if not results:
        return None
    return ScoreResult(**{**results[0], "cached": True})


@router.get("/{resume_id}/{job_id}", response_model=ScoreResult)
async def get_score(resume_id: str, job_id: str) -> ScoreResult:
    """Retrieve a cached score for a resume-job pair.

    Returns 404 if no score has been computed for this pair yet.
    """
    cached = await db.get_score(resume_id, job_id)
    if not cached:
        raise HTTPException(status_code=404, detail="Score not found.")
    return ScoreResult(**{**cached, "cached": True})


@router.delete("/{resume_id}/{job_id}", status_code=204)
async def delete_score(resume_id: str, job_id: str) -> None:
    """Delete the cached score for a resume-job pair.

    Returns 204 on success, 404 if no score exists for this pair.
    """
    deleted = await db.delete_score(resume_id, job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Score not found.")
