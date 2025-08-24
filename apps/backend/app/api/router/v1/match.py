import logging
import traceback
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import get_db_session
from app.services.matching_service import MatchingService
from app.services import (
    ResumeParsingError,
    JobParsingError,
    ResumeNotFoundError,
    JobNotFoundError,
)
from app.core.error_codes import to_error_payload
from app.schemas.pydantic.match import MatchRequest, MatchResponse
from app.core import settings
from app.core.auth import require_auth, Principal

logger = logging.getLogger(__name__)

match_router = APIRouter()


@match_router.post(
    "", summary="Compute heuristic match score and breakdown between a resume and a job", response_model=MatchResponse
)
async def match_resume_job(
    payload: MatchRequest, request: Request, db: AsyncSession = Depends(get_db_session), _principal: Principal = Depends(require_auth)
):
    request_id = getattr(request.state, "request_id", str(uuid4()))
    headers = {"X-Request-ID": request_id}
    svc = MatchingService(db)
    try:
        # size check
        raw_size = len(payload.model_dump_json().encode('utf-8'))
        if raw_size > settings.MAX_JSON_BODY_SIZE_KB * 1024:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=f"JSON body exceeds {settings.MAX_JSON_BODY_SIZE_KB}KB limit")
        result = await svc.match(resume_id=str(payload.resume_id), job_id=str(payload.job_id))
        return JSONResponse(content={"request_id": request_id, "data": result}, headers=headers)
    except (ResumeParsingError, JobParsingError, ResumeNotFoundError, JobNotFoundError) as e:
        logger.warning(str(e))
        code, payload = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=payload, headers=headers)
    except HTTPException as e:
        # already proper
        raise
    except Exception as e:  # pragma: no cover
        logger.error(f"Match error: {e} trace={traceback.format_exc()}")
        code, payload = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=payload, headers=headers)
