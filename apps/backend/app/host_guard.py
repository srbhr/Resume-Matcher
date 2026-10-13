"""Reject requests addressed to a host this app does not serve (DNS rebinding)."""

import logging
from collections.abc import Iterable

from starlette.datastructures import Headers
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

LOOPBACK_HOSTS: frozenset[str] = frozenset({"localhost", "127.0.0.1", "::1"})


def host_name(value: str) -> str:
    """Hostname of a ``Host`` header value: lowercased, port and IPv6 brackets removed."""
    value = value.strip().lower()
    if value.startswith("["):
        end = value.find("]")
        return value[1:end] if end > 0 else ""
    if value.count(":") == 1:
        return value.split(":", 1)[0]
    return value


class HostGuardMiddleware:
    """Return 400 unless ``Host`` and ``X-Forwarded-Host`` name an allowed host.

    The Next.js proxy rewrites ``Host`` to the backend's own address and puts
    the browser's ``Host`` in ``X-Forwarded-Host``, replacing any value the
    client sent, so a rebound request through the frontend is only visible in
    ``X-Forwarded-Host``. Both headers are checked when present.
    """

    def __init__(self, app: ASGIApp, allowed_hosts: Iterable[str]) -> None:
        self.app = app
        self.allowed_hosts = frozenset(host_name(h) for h in allowed_hosts if h.strip())
        self.allow_any = "*" in self.allowed_hosts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self.allow_any or scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        values = [headers.get("host", "")]
        if "x-forwarded-host" in headers:
            values.extend(headers["x-forwarded-host"].split(","))
        if all(host_name(value) in self.allowed_hosts for value in values):
            await self.app(scope, receive, send)
            return
        logger.warning(
            "Rejected request for an unexpected host %r; add it to ALLOWED_HOSTS "
            "to serve it",
            values,
        )
        await PlainTextResponse("Invalid host header", status_code=400)(
            scope, receive, send
        )
