"""Regression coverage for reviewed OAuth and provider-error boundaries."""

import time
from urllib.parse import parse_qs
from unittest.mock import AsyncMock

import httpx
import pytest
import respx
from fastapi import FastAPI

from app import chatgpt
from app.routers.chatgpt import router


def store_tokens(*, expired=False, refresh=True):
    """Store synthetic, previously verified credentials without live login."""
    tokens = {
        "access_token": "test-access",
        "account_id": "test-account",
        "subject": "test-user",
        "expires_at": time.time() + (-1 if expired else 3600),
    }
    if refresh:
        tokens["refresh_token"] = "test-refresh"
    chatgpt._save({"tokens": tokens})


@pytest.mark.asyncio
@respx.mock
async def test_refresh_grant_is_form_encoded_and_rotated():
    store_tokens(expired=True)
    grant = respx.post(chatgpt.ISSUER + "/oauth/token").respond(
        200, json={"access_token": "rotated-access", "refresh_token": "rotated-refresh"}
    )

    result = await chatgpt.fresh_tokens()

    request = grant.calls[0].request
    assert request.headers["content-type"] == "application/x-www-form-urlencoded"
    assert parse_qs(request.content.decode()) == {
        "grant_type": ["refresh_token"],
        "client_id": [chatgpt.CLIENT_ID],
        "refresh_token": ["test-refresh"],
        "scope": ["openid profile email offline_access"],
    }
    assert result["access_token"] == "rotated-access"
    assert chatgpt._load()["tokens"]["refresh_token"] == "rotated-refresh"


@pytest.mark.parametrize("expiry", [None, "invalid", {}, [], "NaN", "Infinity", -1])
@pytest.mark.asyncio
@respx.mock
async def test_malformed_token_expiry_does_not_strand_consumed_login(
    expiry, monkeypatch
):
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/usercode").respond(
        200, json={"device_auth_id": "device", "user_code": "code"}
    )
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/token").respond(
        200, json={"authorization_code": "code", "code_verifier": "verifier"}
    )
    respx.post(chatgpt.ISSUER + "/oauth/token").respond(
        200,
        json={
            "access_token": "test-access",
            "id_token": "test-id",
            "expires_in": expiry,
        },
    )
    monkeypatch.setattr(
        chatgpt,
        "_verify_identity",
        AsyncMock(
            return_value={
                "sub": "test-user",
                chatgpt.AUTH_CLAIM: {"chatgpt_account_id": "test-account"},
            }
        ),
    )

    await chatgpt.start_login()
    before = time.time()
    result = await chatgpt.status(advance=True)

    assert result["connected"] and not result["pending"]
    saved = chatgpt._load()
    assert "device" not in saved
    assert before + 3600 <= saved["tokens"]["expires_at"] <= time.time() + 3600


@pytest.mark.asyncio
@respx.mock
async def test_disconnect_without_refresh_token_does_not_claim_revocation():
    store_tokens(refresh=False)

    result = await chatgpt.disconnect()

    assert not result["revocation_confirmed"]
    assert "not confirmed" in result["warning"]
    assert not chatgpt._path().exists()
    assert not respx.calls


@pytest.mark.parametrize(
    "status, expected", [(429, 429), (500, 503), (503, 503), (504, 503)]
)
@pytest.mark.asyncio
@respx.mock
async def test_catalog_route_preserves_rate_limit_and_outage_categories(
    status, expected
):
    store_tokens()
    respx.get(chatgpt.API_BASE + "/models").respond(status, text="upstream-secret-body")
    app = FastAPI()
    app.include_router(router)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://localhost"
    ) as client:
        response = await client.get(
            "/config/chatgpt/models", headers={"X-ChatGPT-Request": "1"}
        )

    assert response.status_code == expected
    assert "upstream-secret-body" not in response.text


@pytest.mark.parametrize("status", [429, 503])
@pytest.mark.asyncio
@respx.mock
async def test_refresh_transient_failure_keeps_session_and_error_category(status):
    store_tokens(expired=True)
    respx.post(chatgpt.ISSUER + "/oauth/token").respond(status)

    with pytest.raises(chatgpt.ChatGPTError) as failure:
        await chatgpt.fresh_tokens()

    assert failure.value.status_code == status
    assert chatgpt.connected()


@pytest.mark.asyncio
@respx.mock
async def test_catalog_network_outage_is_service_unavailable():
    store_tokens()
    respx.get(chatgpt.API_BASE + "/models").mock(
        side_effect=httpx.ConnectError("secret")
    )

    with pytest.raises(chatgpt.ChatGPTError) as failure:
        await chatgpt.models()

    assert failure.value.status_code == 503
    assert "secret" not in str(failure.value)


def test_empty_session_does_not_gate_and_saving_empty_removes_file():
    chatgpt._save({"tokens": {}})
    assert chatgpt._path().exists()
    assert not chatgpt.has_active_session()

    chatgpt._save({})
    assert not chatgpt._path().exists()


@pytest.mark.asyncio
async def test_expiring_final_device_removes_gate_and_session_file():
    chatgpt._save({"device": {"expires_at": time.time() - 1}})
    assert not chatgpt.has_active_session()

    result = await chatgpt.status()

    assert result["expired"] and not result["pending"]
    assert not chatgpt._path().exists()


@pytest.mark.parametrize(
    "device", [{}, {"expires_at": "invalid"}, {"expires_at": float("nan")}]
)
def test_malformed_session_protects_possible_credentials(device):
    chatgpt._save({"device": device})
    # Empty state has no credential or device material to protect.
    assert chatgpt.has_active_session() is bool(device)


def test_corrupt_session_keeps_gate_closed():
    chatgpt._path().parent.mkdir(parents=True, exist_ok=True)
    chatgpt._path().write_text("invalid-ciphertext", encoding="utf-8")
    assert chatgpt.has_active_session()


@pytest.mark.asyncio
@respx.mock
async def test_consumed_login_with_non_json_exchange_clears_device():
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/usercode").respond(
        200, json={"device_auth_id": "device", "user_code": "code"}
    )
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/token").respond(
        200, json={"authorization_code": "code", "code_verifier": "verifier"}
    )
    respx.post(chatgpt.ISSUER + "/oauth/token").respond(200, text="upstream-secret")
    await chatgpt.start_login()

    with pytest.raises(chatgpt.ChatGPTError) as failure:
        await chatgpt.status(advance=True)

    assert failure.value.status_code == 503
    assert "upstream-secret" not in str(failure.value)
    assert not chatgpt._path().exists()


@pytest.mark.asyncio
@respx.mock
async def test_terminal_device_rejection_requests_new_code_on_retry():
    codes = respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/usercode").respond(
        200, json={"device_auth_id": "device", "user_code": "code"}
    )
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/token").respond(400)
    await chatgpt.start_login()

    with pytest.raises(chatgpt.ChatGPTError):
        await chatgpt.status(advance=True)
    assert not chatgpt._path().exists()
    await chatgpt.start_login()
    assert codes.call_count == 2


@pytest.mark.asyncio
@respx.mock
async def test_incomplete_legacy_device_is_discarded_and_can_login_again():
    chatgpt._save({"device": {"device_auth_id": "old", "user_code": "old"}})
    status = await chatgpt.status()
    assert not status["pending"] and status["expired"]
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/usercode").respond(
        200, json={"device_auth_id": "new", "user_code": "new"}
    )
    assert (await chatgpt.start_login())["user_code"] == "new"


@pytest.mark.parametrize(
    "event",
    [
        "not-json",
        "[]",
        '{"type":"response.output_text.delta","delta":42}',
        '{"type":"response.completed","response":[]}',
        '{"type":"response.failed","response":[],"error":[42]}',
        '{"type":"response.failed","error":{"code":42}}',
    ],
)
@pytest.mark.asyncio
@respx.mock
async def test_malformed_stream_never_becomes_content_retry_error(event):
    store_tokens()
    requests = respx.post(chatgpt.API_BASE + "/responses").respond(
        200, text="data: " + event + "\n\n"
    )

    with pytest.raises(chatgpt.ChatGPTError):
        await chatgpt.complete("test", None, "test-model")

    assert requests.call_count == 1


@pytest.mark.asyncio
async def test_chatgpt_reads_also_require_custom_header():
    app = FastAPI()
    app.include_router(router)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://localhost"
    ) as client:
        assert (await client.get("/config/chatgpt/status")).status_code == 403
        response = await client.get(
            "/config/chatgpt/status", headers={"X-ChatGPT-Request": "1"}
        )
        assert response.status_code == 200


@pytest.mark.parametrize(
    "payload", [{}, {"authorization_code": 42, "code_verifier": "verifier"}]
)
@pytest.mark.asyncio
@respx.mock
async def test_malformed_poll_credentials_are_service_error_without_exchange(payload):
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/usercode").respond(
        200, json={"device_auth_id": "device", "user_code": "code"}
    )
    respx.post(chatgpt.ISSUER + "/api/accounts/deviceauth/token").respond(
        200, json=payload
    )
    await chatgpt.start_login()

    with pytest.raises(chatgpt.ChatGPTError) as failure:
        await chatgpt.status(advance=True)

    assert failure.value.status_code == 503
    assert (await chatgpt.status())["pending"]
