"""One cancellation budget shared by all stages of an AI operation."""

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from contextvars import ContextVar

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.ai_limits import PromptSizeError
from app.config import settings

logger = logging.getLogger(__name__)
_deadline: ContextVar[float | None] = ContextVar("ai_operation_deadline", default=None)


class AIOperationDeadlineExceeded(TimeoutError):
    """The request's shared AI operation budget has been exhausted."""


def remaining_timeout(preferred: float | None = None) -> float:
    """Cap a stage timeout at the operation's remaining monotonic budget."""
    limit = settings.request_timeout_seconds if preferred is None else preferred
    deadline = _deadline.get()
    if deadline is None:
        return float(limit)
    remaining = deadline - asyncio.get_running_loop().time()
    if remaining <= 0:
        raise AIOperationDeadlineExceeded("AI operation deadline exceeded")
    return min(float(limit), remaining)


@asynccontextmanager
async def operation_budget(seconds: float) -> AsyncIterator[None]:
    """Nested operations inherit the earliest deadline, never a fresh budget."""
    deadline = asyncio.get_running_loop().time() + seconds
    parent = _deadline.get()
    if parent is not None:
        deadline = min(deadline, parent)
    token = _deadline.set(deadline)
    try:
        async with asyncio.timeout_at(deadline):
            yield
    finally:
        _deadline.reset(token)


def operation_error_content(request: Request, detail: str) -> dict[str, str | bool]:
    """Retain a committed upload identity without asserting its mutable status."""
    content: dict[str, str | bool] = {"detail": detail}
    uploaded_resume = getattr(request.state, "uploaded_resume", None)
    if uploaded_resume is not None:
        resume_id, is_master = uploaded_resume
        content.update(resume_id=resume_id, is_master=is_master)
    return content


class AIOperationRoute(APIRoute):
    """Bound POST handlers including validation, database reads and persistence."""

    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        handler = super().get_route_handler()
        if "POST" not in self.methods:
            return handler

        async def bounded_handler(request: Request) -> Response:
            started = asyncio.get_running_loop().time()
            try:
                async with operation_budget(settings.request_timeout_seconds):
                    return await handler(request)
            except PromptSizeError as error:
                logger.info("AI prompt rejected by input limit: route=%s", self.path)
                return JSONResponse(
                    status_code=422,
                    content=operation_error_content(request, str(error)),
                )
            except TimeoutError:
                logger.warning(
                    "AI operation timed out: route=%s elapsed=%.3fs",
                    self.path,
                    asyncio.get_running_loop().time() - started,
                )
                return JSONResponse(
                    status_code=504,
                    content=operation_error_content(
                        request,
                        "Operation timed out. Please try again with less input or a longer configured request timeout.",
                    ),
                )

        return bounded_handler
