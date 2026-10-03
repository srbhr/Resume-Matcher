"""Browser sign-in endpoints for the installation's ChatGPT connection."""

from fastapi import APIRouter, Depends, HTTPException, Request

from app import chatgpt
from app.chatgpt_security import require_local_request


def _check_origin(request: Request) -> None:
    """Apply the local boundary and block simple cross-site form submissions."""
    require_local_request(request)
    # Requiring a custom header prevents cross-site form submissions, including
    # requests without an Origin header. Cross-origin scripts require CORS.
    if request.method == "POST" and request.headers.get("x-chatgpt-request") != "1":
        raise HTTPException(403, "Missing ChatGPT request header.")


router = APIRouter(
    prefix="/config/chatgpt",
    tags=["Configuration"],
    dependencies=[Depends(_check_origin)],
)


async def _call(operation):
    """Map safe provider errors to API responses without logging credential data."""
    try:
        return await operation
    except chatgpt.ChatGPTError as error:
        raise HTTPException(400, str(error)) from error


@router.post("/login")
async def login() -> dict:
    """Start or resume device login and return only the browser-facing code."""
    return await _call(chatgpt.start_login())


@router.get("/status")
async def status() -> dict:
    """Read metadata without advancing login or spending model usage."""
    return await _call(chatgpt.status())


@router.post("/poll")
async def poll() -> dict:
    """Poll once; the session manager enforces the provider's polling cadence."""
    return await _call(chatgpt.status(advance=True))


@router.get("/models")
async def models() -> dict:
    """Discover account-specific choices using backend-managed credentials."""
    return {"models": await _call(chatgpt.models())}


@router.post("/logout")
async def logout() -> dict:
    """Disconnect locally and report whether remote revocation was confirmed."""
    return await _call(chatgpt.disconnect())
