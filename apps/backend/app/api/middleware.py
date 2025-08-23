from uuid import uuid4
import re
from starlette.requests import Request
import logging
import contextvars
from starlette.middleware.base import BaseHTTPMiddleware

# Simple PII scrubbing helpers (currently unused but available for future logging integration)
PII_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PII_PHONE = re.compile(r"\+?\d[\d\-() ]{6,}\d")


def scrub_pii(value: str) -> str:
    if not value:
        return value
    redacted = PII_EMAIL.sub("<email>", value)
    redacted = PII_PHONE.sub("<phone>", redacted)
    return redacted


_request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)


class RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # pragma: no cover - simple enrichment
        rid = _request_id_ctx.get()
        record.request_id = rid or "-"
        return True


class PIIScrubbingFormatter(logging.Formatter):  # pragma: no cover - format logic
    def format(self, record: logging.LogRecord) -> str:
        # Ensure request_id always present for format string
        if not hasattr(record, "request_id"):
            try:
                record.request_id = _request_id_ctx.get() or "-"
            except Exception:  # pragma: no cover - defensive
                record.request_id = "-"
        if hasattr(record, "msg") and isinstance(record.msg, str):
            record.msg = scrub_pii(record.msg)
        return super().format(record)


def install_request_logging() -> None:
    root = logging.getLogger()
    # idempotent: ensure filter + formatter present
    has_filter = any(isinstance(f, RequestIDFilter) for f in root.filters)
    if not has_filter:
        root.addFilter(RequestIDFilter())
    for handler in root.handlers:
        if not isinstance(handler.formatter, PIIScrubbingFormatter):
            base_fmt = handler.formatter._fmt if handler.formatter else "[%(asctime)s - %(name)s - %(levelname)s] %(message)s"  # type: ignore[attr-defined]
            datefmt = handler.formatter.datefmt if handler.formatter else "%Y-%m-%dT%H:%M:%S%z"  # type: ignore[attr-defined]
            handler.setFormatter(PIIScrubbingFormatter(base_fmt + " request_id=%(request_id)s", datefmt))


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # noqa: D401
        """Attach (or propagate) a request/correlation id and expose via headers."""
        path_parts = request.url.path.strip("/").split("/")
        service_tag = f"{path_parts[2]}:" if len(path_parts) > 2 else ""
        inbound = request.headers.get("x-request-id") or request.headers.get("x-correlation-id")
        request_id = inbound if inbound else f"{service_tag}{uuid4()}"
        request.state.request_id = request_id
        token = _request_id_ctx.set(request_id)
        install_request_logging()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Correlation-ID"] = request_id
        _request_id_ctx.reset(token)
        return response
