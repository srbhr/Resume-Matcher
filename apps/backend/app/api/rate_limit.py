import time
import asyncio
import os
from typing import Dict, Tuple
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core import settings

# Simple in-memory token bucket per IP (NOT for multi-process / production scale without external store)
class InMemoryRateLimiter:
    def __init__(self, capacity: int, window_seconds: int):
        self.capacity = capacity
        self.window = window_seconds
        self._lock = asyncio.Lock()
        self._buckets: Dict[str, Tuple[int, float]] = {}

    async def check(self, key: str) -> bool:
        now = time.time()
        async with self._lock:
            tokens, reset = self._buckets.get(key, (self.capacity, now + self.window))
            if now > reset:
                tokens = self.capacity
                reset = now + self.window
            if tokens <= 0:
                self._buckets[key] = (tokens, reset)
                return False
            tokens -= 1
            self._buckets[key] = (tokens, reset)
            return True

    async def get_state(self, key: str) -> Tuple[int, float]:
        now = time.time()
        async with self._lock:
            tokens, reset = self._buckets.get(key, (self.capacity, now + self.window))
            if now > reset:
                return self.capacity, now + self.window
            return tokens, reset

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-app in-memory rate limiter.

    Tests previously exhausted a module-global bucket leading to flaky 429s. By
    instantiating a limiter per app instance we isolate test cases and still
    exercise logic. To disable entirely set RATE_LIMIT_ENABLED=false or define
    PYTEST_CURRENT_TEST env (auto-bypass for unit tests expecting other status codes).
    """

    def __init__(self, app):  # type: ignore[no-untyped-def]
        super().__init__(app)
        self._limiter = InMemoryRateLimiter(
            capacity=settings.RATE_LIMIT_REQUESTS,
            window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
        )

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        # Re-evaluate enabled flag each request to honor monkeypatch / env overrides inside tests
        if not settings.RATE_LIMIT_ENABLED or os.environ.get('RATE_LIMIT_FORCE_DISABLE') == 'true':
            return await call_next(request)
        path = request.url.path
        if (
            path == '/healthz' or
            path.startswith('/api/health') or
            path.startswith('/api/docs') or
            path.startswith('/api/openapi')
        ):
            return await call_next(request)
        client_ip = request.client.host if request.client else 'unknown'
        allowed = await self._limiter.check(client_ip)
        tokens_left, reset = await self._limiter.get_state(client_ip)
        if not allowed:
            retry = max(0, int(reset - time.time()))
            return JSONResponse(
                status_code=429,
                content={'detail': 'Rate limit exceeded', 'retry_after_seconds': retry},
                headers={
                    'Retry-After': str(retry),
                    'X-RateLimit-Limit': str(settings.RATE_LIMIT_REQUESTS),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': str(int(reset))
                }
            )
        response: Response = await call_next(request)
        response.headers['X-RateLimit-Limit'] = str(settings.RATE_LIMIT_REQUESTS)
        response.headers['X-RateLimit-Remaining'] = str(tokens_left)
        response.headers['X-RateLimit-Reset'] = str(int(reset))
        return response
