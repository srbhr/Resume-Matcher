"""Regression coverage for browser provenance and installation-wide guards."""

import time

import httpx
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app import chatgpt
from app.chatgpt_security import require_local_request
from app.crypto import encrypt
from app.main import app


def local_request(method="GET", headers=None):
    """Represent a direct loopback API request without fabricated provenance."""
    return Request(
        {
            "type": "http",
            "scheme": "http",
            "path": "/api/v1/health",
            "method": method,
            "server": ("127.0.0.1", 8000),
            "client": ("127.0.0.1", 1234),
            "headers": [
                (key.lower().encode(), value.encode())
                for key, value in {"host": "127.0.0.1:8000", **(headers or {})}.items()
            ],
        }
    )


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_every_protected_mutation_requires_custom_header(method):
    """Missing browser metadata cannot let a simple HTML form mutate the API."""
    with pytest.raises(HTTPException) as error:
        require_local_request(local_request(method))
    assert error.value.status_code == 403


@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "PATCH", "DELETE"])
def test_allowlisted_cross_site_loopback_origins_are_accepted(method):
    """localhost to 127.0.0.1 is a valid explicitly allowed browser flow."""
    require_local_request(
        local_request(
            method,
            {
                "Origin": "http://localhost:3000",
                "Sec-Fetch-Site": "cross-site",
                "X-ChatGPT-Request": "1",
            },
        )
    )


@pytest.mark.parametrize(
    "origin",
    ["http://[::1", "http://localhost:invalid", "http://localhost:9999", "null"],
)
def test_malformed_and_untrusted_origins_return_forbidden(origin):
    with pytest.raises(HTTPException) as error:
        require_local_request(local_request(headers={"Origin": origin}))
    assert error.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
async def test_uniform_csrf_guard_covers_non_chatgpt_api_routes(method):
    """The shared middleware rejects mutation before endpoint handling."""
    chatgpt._save({"tokens": {"access_token": "test-only-token"}})
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://localhost"
    ) as client:
        response = await client.request(method, "/api/v1/config/llm-api-key")
    assert response.status_code == 403
    assert response.json()["detail"] == "Missing ChatGPT request header."


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["empty", "expired", "active"])
async def test_only_active_session_state_restricts_other_api_routes(state):
    """An abandoned expired code or empty encrypted file does not lock the API."""
    if state == "empty":
        chatgpt._path().parent.mkdir(parents=True, exist_ok=True)
        chatgpt._path().write_text(encrypt("{}"), encoding="utf-8")
    else:
        chatgpt._save(
            {"device": {"expires_at": time.time() + (900 if state == "active" else -1)}}
        )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=("192.168.1.2", 1234)),
        base_url="http://localhost",
    ) as client:
        response = await client.get("/api/v1/health")
    assert response.status_code == (403 if state == "active" else 200)
