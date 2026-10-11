"""Sign in with ChatGPT endpoints: start sign-in, callback, status, sign-out, models.

The browser goes ``Settings -> auth.openai.com -> 127.0.0.1:<backend
port>/auth/callback -> Settings``. The callback path is fixed by OpenAI's
loopback-redirect rule (only the port may change), so it is served at the app
root rather than under ``/api/v1``.
"""

import ipaddress
import logging
from typing import Any
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app import chatgpt_auth, chatgpt_inference
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/config/chatgpt", tags=["ChatGPT plan"])
callback_router = APIRouter(tags=["ChatGPT plan"])


def _is_loopback(host: str | None) -> bool:
    if not host:
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    mapped = getattr(address, "ipv4_mapped", None)
    return (mapped or address).is_loopback


def _require_loopback(request: Request) -> None:
    """Sign-in only works from this machine: the redirect targets 127.0.0.1."""
    if not _is_loopback(request.client.host if request.client else None):
        raise HTTPException(
            status_code=403,
            detail="Sign in with ChatGPT only works from the machine running Resume Matcher.",
        )


def _caller_origin(request: Request) -> str | None:
    """The origin the browser declares: ``Origin``, else the ``Referer``'s origin."""
    origin = request.headers.get("origin")
    if origin is None:
        referer = request.headers.get("referer")
        if not referer:
            return None
        parts = urlsplit(referer)
        origin = f"{parts.scheme}://{parts.netloc}" if parts.netloc else "null"
    return origin.strip().rstrip("/").lower()


def _is_trusted_origin(request: Request, origin: str) -> bool:
    """Same-origin, a configured frontend/CORS origin, or a loopback page."""
    parts = urlsplit(origin)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return False  # includes the opaque "null" origin
    if origin in {o.rstrip("/").lower() for o in settings.effective_cors_origins}:
        return True
    if parts.hostname == "localhost" or _is_loopback(parts.hostname):
        return True
    # Same-origin: the Next.js proxy rewrites Host, so also accept the browser's
    # own Host that it forwards.
    hosts = (request.headers.get("host"), request.headers.get("x-forwarded-host"))
    return parts.netloc in {h.strip().lower() for h in hosts if h}


def _require_trusted_origin(request: Request) -> None:
    """Refuse cross-site form posts to the state-changing routes.

    Browsers always send ``Origin`` (or at least ``Referer``) on a cross-site
    POST, and CORS does not stop a simple form post from being delivered.
    Requests with neither header are not from a browser page, so they pass.
    """
    origin = _caller_origin(request)
    if origin is not None and not _is_trusted_origin(request, origin):
        raise HTTPException(status_code=403, detail="Cross-site request blocked.")


@router.post("/login")
async def start_chatgpt_login(request: Request) -> dict[str, str]:
    """Return the OpenAI authorization URL for the browser to open."""
    _require_loopback(request)
    _require_trusted_origin(request)
    # The port this backend actually accepted the connection on, so the
    # redirect reaches it even when uvicorn was started with --port.
    server = request.scope.get("server")
    port = server[1] if server and server[1] else settings.port
    try:
        url = chatgpt_auth.start_login(int(port))
    except Exception:
        logger.exception("Could not start Sign in with ChatGPT")
        raise HTTPException(
            status_code=500, detail="Could not start ChatGPT sign-in. Please try again."
        )
    return {"authorization_url": url}


@callback_router.get(chatgpt_auth.CALLBACK_PATH, include_in_schema=False)
async def chatgpt_callback(request: Request) -> RedirectResponse:
    """OpenAI's redirect target. Finishes sign-in, then returns to Settings."""
    _require_loopback(request)
    try:
        outcome = await chatgpt_auth.complete_login(dict(request.query_params))
    except chatgpt_auth.ChatGPTLoginError as error:
        logger.warning("Sign in with ChatGPT did not complete: %s", error)
        outcome = error.outcome
    except Exception:
        logger.exception("Sign in with ChatGPT failed")
        outcome = "error"
    target = settings.frontend_base_url.rstrip("/")
    return RedirectResponse(
        f"{target}/settings?{urlencode({'chatgpt': outcome})}",
        status_code=303,
        # The callback URL carried an authorization code.
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


@router.get("/status")
async def chatgpt_status() -> dict[str, Any]:
    """Whether a ChatGPT plan is connected. Never returns a token."""
    return chatgpt_auth.status()


@router.post("/logout")
async def chatgpt_logout(request: Request) -> dict[str, bool]:
    """Revoke the session at OpenAI and forget the tokens locally."""
    _require_trusted_origin(request)
    try:
        revoked = await chatgpt_auth.disconnect()
    except Exception:
        logger.exception("Sign out from ChatGPT failed")
        raise HTTPException(
            status_code=500, detail="Could not disconnect ChatGPT. Please try again."
        )
    return {"revoked": revoked}


@router.get("/models")
async def chatgpt_models() -> dict[str, list[dict[str, str]]]:
    """The signed-in account's models for the picker."""
    try:
        models = await chatgpt_inference.list_models()
    except chatgpt_auth.ChatGPTNotConnectedError:
        raise HTTPException(status_code=409, detail="Sign in with ChatGPT first.")
    except Exception:
        logger.exception("Listing ChatGPT plan models failed")
        raise HTTPException(
            status_code=502, detail="Could not load your ChatGPT models."
        )
    return {"models": models}
