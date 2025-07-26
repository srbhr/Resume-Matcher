import logging

from sqlalchemy.exc import SQLAlchemyError
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

logger = logging.getLogger(__name__)


async def custom_http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", "")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": request_id},
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", "")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "request_id": request_id},
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "")
    
    # Log the full exception details for debugging
    logger.error(
        f"Unhandled exception for request {request_id} to {request.url}: {exc.__class__.__name__}: {str(exc)}",
        exc_info=True
    )
    
    return JSONResponse(
        status_code=HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An internal error occurred. Please try again later.", 
            "request_id": request_id
        },
    )


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"DB error on {request.url}: {exc} - {exc.with_traceback()}")
    return JSONResponse(
        status_code=500,
        content={
            "request_id": getattr(request.state, "request_id", None),
            "detail": "A database error occurred. Please try again later.",
        },
    )
