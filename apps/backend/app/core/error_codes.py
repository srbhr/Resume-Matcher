from __future__ import annotations
from dataclasses import dataclass
from typing import Type, Dict, Any

from fastapi import status

from app.services import (
    ResumeNotFoundError,
    JobNotFoundError,
    ResumeParsingError,
    JobParsingError,
    ResumeValidationError,
    ResumeKeywordExtractionError,
    JobKeywordExtractionError,
    AIProcessingError,
)
from app.agent.exceptions import ProviderError


@dataclass(frozen=True)
class ErrorMeta:
    code: str
    http_status: int


ERROR_MAP: Dict[Type[BaseException], ErrorMeta] = {
    ResumeNotFoundError: ErrorMeta("RESUME_NOT_FOUND", status.HTTP_404_NOT_FOUND),
    JobNotFoundError: ErrorMeta("JOB_NOT_FOUND", status.HTTP_404_NOT_FOUND),
    ResumeValidationError: ErrorMeta("RESUME_VALIDATION_FAILED", status.HTTP_422_UNPROCESSABLE_ENTITY),
    ResumeParsingError: ErrorMeta("RESUME_PARSING_FAILED", status.HTTP_422_UNPROCESSABLE_ENTITY),
    JobParsingError: ErrorMeta("JOB_PARSING_FAILED", status.HTTP_422_UNPROCESSABLE_ENTITY),
    ResumeKeywordExtractionError: ErrorMeta("RESUME_KEYWORD_EXTRACTION_FAILED", status.HTTP_422_UNPROCESSABLE_ENTITY),
    JobKeywordExtractionError: ErrorMeta("JOB_KEYWORD_EXTRACTION_FAILED", status.HTTP_422_UNPROCESSABLE_ENTITY),
    AIProcessingError: ErrorMeta("AI_PROVIDER_UNAVAILABLE", status.HTTP_503_SERVICE_UNAVAILABLE),
    ProviderError: ErrorMeta("AI_PROVIDER_UNAVAILABLE", status.HTTP_503_SERVICE_UNAVAILABLE),
}


def to_error_payload(exc: Exception, request_id: str) -> tuple[int, dict[str, Any]]:
    meta = ERROR_MAP.get(type(exc))
    if meta:
        return meta.http_status, {
            "request_id": request_id,
            "error": {"code": meta.code, "message": str(exc)},
        }
    return status.HTTP_500_INTERNAL_SERVER_ERROR, {
        "request_id": request_id,
        "error": {"code": "INTERNAL_ERROR", "message": "Internal Server Error"},
    }
