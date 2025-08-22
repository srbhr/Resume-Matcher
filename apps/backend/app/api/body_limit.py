from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette import status
from ..core import settings

class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Early raw body size limiter for JSON requests.

    Some tests construct an oversized JSON expecting a 413 before model parsing.
    FastAPI / Pydantic would otherwise parse and raise domain 422 errors first.
    This middleware reads the body stream (single read) and enforces a max size.
    The consumed body is then reattached for downstream handlers.
    """
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        # Only apply to JSON POST/PUT/PATCH
        if request.method in {"POST", "PUT", "PATCH"} and request.headers.get("content-type", "").startswith("application/json"):
            body = await request.body()
            if len(body) > settings.MAX_JSON_BODY_SIZE_KB * 1024:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={
                        "request_id": getattr(request.state, "request_id", "body_limit"),
                        "error": {
                            "code": "PAYLOAD_TOO_LARGE",
                            "message": f"JSON body exceeds {settings.MAX_JSON_BODY_SIZE_KB}KB limit"
                        }
                    }
                )
            # Recreate receive so downstream can read
            async def receive():  # type: ignore[no-untyped-def]
                return {"type": "http.request", "body": body, "more_body": False}
            request._receive = receive  # type: ignore[attr-defined]
        return await call_next(request)
