import logging

from sqlalchemy.exc import SQLAlchemyError
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

logger = logging.getLogger(__name__)


from typing import Any
from starlette.responses import Response


async def custom_http_exception_handler(request: Request, exc: HTTPException) -> Response:
    request_id = getattr(request.state, "request_id", "")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": request_id},
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> Response:
    request_id = getattr(request.state, "request_id", "")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "request_id": request_id},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> Response:
    request_id = getattr(request.state, "request_id", "")
    return JSONResponse(
        status_code=HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal Server Error", "request_id": request_id},
    )


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError) -> Response:
    logger.error("DB error on %s: %s", request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "request_id": getattr(request.state, "request_id", None),
            "detail": "A database error occurred. Please try again later.",
        },
    )
