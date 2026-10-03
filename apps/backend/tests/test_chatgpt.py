"""Device login, rotating credentials, and subscription response boundaries."""

import asyncio
import json
import time
from unittest.mock import AsyncMock

import httpx
import jwt
import pytest
import respx
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from starlette.requests import Request

from app import chatgpt
from app.chatgpt_security import require_local_request
from app.config import settings
from app.llm import LLMConfig, complete_json, resolve_api_key
from app.routers.chatgpt import router

# Test-only signing material exercises real JWT validation without contacting OpenAI.
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(_private_key.public_key()))
_public_jwk["kid"] = "test-key"


@pytest.fixture(autouse=True)
def trusted_test_keys(monkeypatch):
    """Give each test an isolated trusted JWKS cache; network remains blocked."""
    monkeypatch.setattr(chatgpt, "_jwks_cache", ([_public_jwk], time.monotonic() + 300))


def identity_claims():
    return {
        "iss": chatgpt.ISSUER,
        "aud": chatgpt.CLIENT_ID,
        "sub": "test-user",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "email": "user@example.com",
        chatgpt.AUTH_CLAIM: {
            "chatgpt_account_id": "test-account",
            "chatgpt_plan_type": "plus",
        },
    }


def token_response(access="access-secret", refresh="refresh-secret"):
    return {
        "access_token": access,
        "refresh_token": refresh,
        "id_token": jwt.encode(
            identity_claims(),
            _private_key,
            algorithm="RS256",
            headers={"kid": "test-key"},
        ),
        "expires_in": 3600,
    }


def store_connection(*, expired=False):
    tokens = chatgpt._tokens(token_response(), claims=identity_claims())
    if expired:
        tokens["expires_at"] = time.time() - 1
    chatgpt._save({"tokens": tokens})


@pytest.mark.asyncio
@respx.mock
async def test_device_login_keeps_secrets_on_server_and_survives_restart():
    code_route = respx.post(
        chatgpt.ISSUER + "/api/accounts/deviceauth/usercode"
    ).respond(
        200,
        json={
            "device_auth_id": "device-secret",
            "user_code": "ABCD-1234",
            "interval": "5",
        },
    )
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/token").respond(
        200,
        json={"authorization_code": "code-secret", "code_verifier": "verifier-secret"},
    )
    exchange = respx.post(chatgpt.ISSUER + "/oauth/token").respond(
        200, json=token_response()
    )

    login = await chatgpt.start_login()
    assert login["user_code"] == "ABCD-1234"
    assert "device_auth_id" not in login
    assert await chatgpt.start_login() == login
    assert code_route.call_count == 1
    state = await chatgpt.status(advance=True)
    assert state["connected"] and not state["pending"]
    assert state["email"] == "user@example.com"
    assert "access_token" not in json.dumps(state)
    assert b"verifier-secret" in exchange.calls[0].request.content
    ciphertext = (settings.data_dir / "chatgpt-session.enc").read_text()
    assert "access-secret" not in ciphertext
    assert "refresh-secret" not in ciphertext
    assert "user@example.com" not in ciphertext
    assert chatgpt.connected()


@pytest.mark.asyncio
@respx.mock
async def test_pending_device_poll_respects_server_interval():
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/usercode").respond(
        200, json={"device_auth_id": "device", "user_code": "code", "interval": 5}
    )
    poll = respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/token").respond(403)
    await chatgpt.start_login()
    assert (await chatgpt.status(advance=True))["pending"]
    assert (await chatgpt.status(advance=True))["pending"]
    assert poll.call_count == 1


@pytest.mark.asyncio
@respx.mock
async def test_concurrent_refreshes_rotate_token_once():
    store_connection(expired=True)
    refresh = respx.post(chatgpt.ISSUER + "/oauth/token").respond(
        200, json=token_response("new-access", "new-refresh")
    )
    results = await asyncio.gather(chatgpt.fresh_tokens(), chatgpt.fresh_tokens())
    assert refresh.call_count == 1
    assert all(result["access_token"] == "new-access" for result in results)
    assert chatgpt._load()["tokens"]["refresh_token"] == "new-refresh"


@pytest.mark.asyncio
@respx.mock
async def test_revoked_refresh_removes_connection_without_leaking_upstream_body():
    store_connection(expired=True)
    respx.post(chatgpt.ISSUER + "/oauth/token").respond(
        401, json={"error": "refresh-secret"}
    )
    with pytest.raises(chatgpt.ChatGPTError, match="revoked") as error:
        await chatgpt.fresh_tokens()
    assert "refresh-secret" not in str(error.value)
    assert not chatgpt.connected()


def stream(*events):
    return "".join("data: " + json.dumps(event) + "\n\n" for event in events)


@pytest.mark.asyncio
@respx.mock
async def test_subscription_transport_requires_completed_stream():
    store_connection()
    route = respx.post(chatgpt.API_BASE + "/responses").respond(
        200,
        text=stream(
            {"type": "response.output_text.delta", "delta": "Hello"},
            {"type": "response.completed", "response": {"status": "completed"}},
        ),
    )
    assert (
        await chatgpt.complete("Hi", "Be helpful", "account-model", "minimal")
        == "Hello"
    )
    request = route.calls[0].request
    payload = json.loads(request.content)
    assert payload["store"] is False and payload["stream"] is True
    assert payload["instructions"] == "Be helpful"
    assert payload["reasoning"]["effort"] == "low"
    assert "max_output_tokens" not in payload and "temperature" not in payload
    assert request.headers["chatgpt-account-id"] == "test-account"


@pytest.mark.asyncio
@respx.mock
@pytest.mark.parametrize(
    "terminal",
    [
        None,
        {"type": "response.incomplete"},
        {
            "type": "response.failed",
            "response": {"error": {"code": "usage_limit_reached"}},
        },
    ],
)
async def test_partial_text_is_never_returned_as_success(terminal):
    store_connection()
    events = [{"type": "response.output_text.delta", "delta": "partial"}]
    if terminal:
        events.append(terminal)
    respx.post(chatgpt.API_BASE + "/responses").respond(200, text=stream(*events))
    with pytest.raises(chatgpt.ChatGPTError):
        await chatgpt.complete("Hi", None, "account-model")


@pytest.mark.asyncio
async def test_json_content_retries_preserve_existing_validator(monkeypatch):
    call = AsyncMock(side_effect=['{"value":"wrong"}', '{"value":"valid"}'])
    monkeypatch.setattr(chatgpt, "complete", call)
    config = LLMConfig(provider="chatgpt", model="account-model", api_key="")

    def validate(value):
        if value["value"] != "valid":
            raise ValueError("Invalid content")
        return value

    result = await complete_json(
        "Return JSON", config=config, response_validator=validate
    )
    assert result == {"value": "valid"}
    assert call.await_count == 2


@pytest.mark.asyncio
async def test_transport_errors_do_not_spend_content_retry_budget(monkeypatch):
    call = AsyncMock(side_effect=chatgpt.ChatGPTError("Usage limit reached"))
    monkeypatch.setattr(chatgpt, "complete", call)
    with pytest.raises(chatgpt.ChatGPTError):
        await complete_json(
            "Return JSON",
            config=LLMConfig(provider="chatgpt", model="model", api_key=""),
        )
    assert call.await_count == 1


def test_chatgpt_never_inherits_api_keys():
    assert (
        resolve_api_key(
            {"api_key": "paid-api-key", "api_keys": {"openai": "other-key"}}, "chatgpt"
        )
        == ""
    )


@pytest.mark.asyncio
async def test_connection_routes_reject_cross_site_mutations(monkeypatch):
    login = AsyncMock(return_value={"user_code": "code"})
    monkeypatch.setattr(chatgpt, "start_login", login)
    app = FastAPI()
    app.include_router(router)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 1234)),
        base_url="http://localhost",
    ) as client:
        assert (await client.post("/config/chatgpt/login")).status_code == 403
        assert (
            await client.post(
                "/config/chatgpt/login",
                headers={
                    "Origin": "https://untrusted.example",
                    "X-ChatGPT-Request": "1",
                },
            )
        ).status_code == 403
        response = await client.post(
            "/config/chatgpt/login", headers={"X-ChatGPT-Request": "1"}
        )
        assert response.status_code == 200
    assert login.await_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "claim,value",
    [
        ("iss", "https://attacker.example"),
        ("aud", "wrong-client"),
        ("exp", 1),
        ("sub", None),
    ],
)
async def test_identity_validation_rejects_invalid_claims(claim, value):
    claims = identity_claims()
    claims[claim] = value
    identity = jwt.encode(
        claims, _private_key, algorithm="RS256", headers={"kid": "test-key"}
    )
    with pytest.raises(chatgpt.ChatGPTError, match="verify"):
        await chatgpt._verify_identity(identity)


@pytest.mark.asyncio
async def test_identity_validation_rejects_wrong_signature_and_unsigned_tokens():
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode(
        identity_claims(), other_key, algorithm="RS256", headers={"kid": "test-key"}
    )
    with pytest.raises(chatgpt.ChatGPTError, match="verify"):
        await chatgpt._verify_identity(forged)
    unsigned = jwt.encode(
        identity_claims(), key="", algorithm="none", headers={"kid": "test-key"}
    )
    with pytest.raises(chatgpt.ChatGPTError, match="unsupported"):
        await chatgpt._verify_identity(unsigned)


@pytest.mark.asyncio
async def test_refresh_cannot_replace_the_verified_account():
    previous = chatgpt._tokens(token_response(), claims=identity_claims())
    changed = identity_claims()
    changed[chatgpt.AUTH_CLAIM]["chatgpt_account_id"] = "different-account"
    raw = token_response()
    raw["id_token"] = jwt.encode(
        changed, _private_key, algorithm="RS256", headers={"kid": "test-key"}
    )
    with pytest.raises(chatgpt.ChatGPTError, match="account changed"):
        await chatgpt._verified_tokens(raw, previous)


@pytest.mark.asyncio
@respx.mock
async def test_model_catalog_preserves_all_returned_visible_models():
    store_connection()
    route = respx.get(chatgpt.API_BASE + "/models").respond(
        200,
        json={
            "models": [
                {
                    "slug": "account-sol",
                    "display_name": "Account Sol",
                    "visibility": "list",
                },
                {
                    "slug": "account-luna",
                    "display_name": "Account Luna",
                    "visibility": "list",
                },
                {"slug": "hidden", "visibility": "hide"},
            ]
        },
    )
    assert await chatgpt.models() == [
        {"id": "account-sol", "name": "Account Sol"},
        {"id": "account-luna", "name": "Account Luna"},
    ]
    assert (
        route.calls[0].request.url.params["client_version"]
        == settings.chatgpt_client_version
    )


@pytest.mark.asyncio
@respx.mock
@pytest.mark.parametrize("revocation_status", [200, 503])
async def test_disconnect_clears_local_secrets_and_reports_revocation(
    revocation_status,
):
    store_connection()
    revoke = respx.post(chatgpt.ISSUER + "/api/accounts/oauth/revoke").respond(
        revocation_status
    )
    result = await chatgpt.disconnect()
    assert result["revocation_confirmed"] is (revocation_status == 200)
    assert bool(result["warning"]) is (revocation_status != 200)
    assert not chatgpt._path().exists()
    assert "refresh-secret" not in json.dumps(result)
    assert b"refresh-secret" in revoke.calls[0].request.content


@pytest.mark.parametrize(
    "peer,host,headers",
    [
        ("192.168.1.2", "localhost:8000", {}),
        ("192.168.1.2", "localhost:8000", {"x-forwarded-for": "127.0.0.1"}),
        ("127.0.0.1", "attacker.example", {}),
        ("127.0.0.1", "localhost:8000", {"x-forwarded-for": "192.168.1.2"}),
        ("127.0.0.1", "localhost:8000", {"origin": "https://attacker.example"}),
        ("127.0.0.1", "localhost:8000", {"sec-fetch-site": "cross-site"}),
        ("127.0.0.1", "evil@localhost:8000", {}),
    ],
)
def test_local_boundary_rejects_remote_and_rebinding_requests(peer, host, headers):
    from fastapi import HTTPException

    request = Request(
        {
            "type": "http",
            "scheme": "http",
            "path": "/",
            "server": ("localhost", 8000),
            "client": (peer, 1234),
            "headers": [
                (k.encode(), v.encode()) for k, v in {"host": host, **headers}.items()
            ],
        }
    )
    with pytest.raises(HTTPException) as error:
        require_local_request(request)
    assert error.value.status_code == 403


@pytest.mark.parametrize(
    "peer,host", [("127.0.0.1", "localhost:8000"), ("::1", "[::1]:8000")]
)
def test_local_boundary_allows_loopback(peer, host):
    request = Request(
        {
            "type": "http",
            "scheme": "http",
            "path": "/",
            "server": ("localhost", 8000),
            "client": (peer, 1234),
            "headers": [(b"host", host.encode())],
        }
    )
    require_local_request(request)


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/api/v1/health", "/api/v1/resumes"])
async def test_saved_subscription_protects_routes_outside_login_router(path):
    """A remote caller cannot bypass the guard through other API routes."""
    from app.main import app

    store_connection()
    transport = httpx.ASGITransport(app=app, client=("192.168.1.2", 1234))
    async with httpx.AsyncClient(
        transport=transport, base_url="http://localhost"
    ) as client:
        response = await client.get(path)
    assert response.status_code == 403
    assert response.json() == {
        "detail": "ChatGPT subscription access is restricted to this machine."
    }
