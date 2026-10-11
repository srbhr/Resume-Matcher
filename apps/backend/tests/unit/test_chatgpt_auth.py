"""Sign in with ChatGPT (official open-source flow): PKCE, state and storage.

Every OpenAI endpoint is faked with respx; the conftest socket guard fails any
test that would reach the real network.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import stat
from collections.abc import Iterator
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
import respx

from app import chatgpt_auth
from app.config import settings
from tests import chatgpt_fakes as fakes


@pytest.fixture(autouse=True)
def _fresh_auth_state() -> Iterator[None]:
    chatgpt_auth.reset_state()
    yield
    chatgpt_auth.reset_state()


def _query(url: str) -> dict[str, str]:
    parsed = parse_qs(urlsplit(url).query, strict_parsing=True)
    assert all(len(v) == 1 for v in parsed.values()), "no repeated parameters"
    return {k: v[0] for k, v in parsed.items()}


class TestCredentialStore:
    def test_round_trips_through_an_encrypted_owner_only_file(self) -> None:
        record = {
            "client_id": "oaiapp_123",
            "access_token": "access-SECRET-value",
            "refresh_token": "refresh-SECRET-value",
            "id_token": "id-SECRET-value",
        }
        chatgpt_auth.save_record(record)

        path = settings.data_dir / "chatgpt_credentials.enc"
        raw = path.read_bytes()
        for secret in ("access-SECRET-value", "refresh-SECRET-value", "oaiapp_123"):
            assert secret.encode() not in raw
        if os.name != "nt":
            assert stat.S_IMODE(path.stat().st_mode) == 0o600
        assert chatgpt_auth.load_record() == record
        # Atomic replace leaves no temp files behind.
        assert [p.name for p in path.parent.iterdir() if p.name.endswith(".tmp")] == []


class TestStartLogin:
    def test_first_sign_in_registers_a_dynamic_client(self) -> None:
        url = chatgpt_auth.start_login(8000)

        assert url.startswith("https://auth.openai.com/api/accounts/authorize?")
        params = _query(url)
        assert params["client_id"] == "dynamic_agent_client"
        assert params["agent_name_hint"] == "Resume Matcher"
        assert params["response_type"] == "code"
        assert params["redirect_uri"] == "http://127.0.0.1:8000/auth/callback"
        assert params["scope"].split() == [
            "openid",
            "profile",
            "email",
            "offline_access",
            "resource.invoke",
            "chatgpt.tokens.use.direct",
        ]
        assert params["resource"] == "https://api.openai.com/v1"
        assert params["code_challenge_method"] == "S256"
        assert "login_hint" not in params and "prompt" not in params
        # Values are percent-encoded, not form-encoded (no '+' for spaces).
        assert "scope=openid%20profile" in url

    def test_pkce_challenge_is_s256_of_the_stored_verifier(self) -> None:
        params = _query(chatgpt_auth.start_login(8000))
        pending = chatgpt_auth._pending_logins[params["state"]]

        digest = hashlib.sha256(pending.code_verifier.encode()).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        assert params["code_challenge"] == expected
        assert "=" not in params["code_challenge"]
        assert 43 <= len(pending.code_verifier) <= 128
        assert pending.nonce == params["nonce"]
        assert pending.redirect_uri == params["redirect_uri"]
        assert pending.client_id == "dynamic_agent_client"


# ---------------------------------------------------------------------------
# The loopback callback: state, code exchange, ID token, granted scopes
# ---------------------------------------------------------------------------


def _start(port: int = 8000) -> dict[str, str]:
    return _query(chatgpt_auth.start_login(port))


@pytest.fixture
def openai_auth() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        fakes.mount_discovery(router)
        yield router


class TestCompleteLogin:
    async def test_unknown_state_is_rejected_before_any_exchange(
        self, openai_auth: respx.MockRouter
    ) -> None:
        token = openai_auth.post(chatgpt_auth.TOKEN_URL)
        _start()

        with pytest.raises(chatgpt_auth.ChatGPTLoginError) as raised:
            await chatgpt_auth.complete_login(
                {"state": "forged", "code": "c", "client_id": fakes.ISSUED_CLIENT_ID}
            )
        assert raised.value.outcome == "error"
        assert not token.called
        assert "access_token" not in chatgpt_auth.load_record()

    async def test_new_registration_exchanges_the_code_with_pkce_and_saves_tokens(
        self, openai_auth: respx.MockRouter
    ) -> None:
        params = _start(8123)
        verifier = chatgpt_auth._pending_logins[params["state"]].code_verifier
        token = openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
            return_value=fakes.token_response(nonce=params["nonce"])
        )

        outcome = await chatgpt_auth.complete_login(
            {
                "state": params["state"],
                "code": "auth-code",
                "client_id": fakes.ISSUED_CLIENT_ID,
                "scope": fakes.ALL_SCOPES,
            }
        )

        assert outcome == "connected"
        sent = fakes.form(token.calls.last.request)
        assert sent == {
            "grant_type": "authorization_code",
            "client_id": fakes.ISSUED_CLIENT_ID,
            "code": "auth-code",
            "code_verifier": verifier,
            "redirect_uri": "http://127.0.0.1:8123/auth/callback",
            "resource": "https://api.openai.com/v1",
        }
        assert (
            chatgpt_auth.code_challenge(sent["code_verifier"])
            == params["code_challenge"]
        )
        record = chatgpt_auth.load_record()
        assert record["client_id"] == fakes.ISSUED_CLIENT_ID
        assert record["subject"] == fakes.SUBJECT
        assert record["email"] == fakes.EMAIL
        assert record["access_token"] == "access-1"
        assert record["refresh_token"] == "refresh-1"
        assert "chatgpt.tokens.use.direct" in record["scopes"]
        assert record["ext_agent_host_id"] == params["ext_agent_host_id"]

    async def test_omitted_token_scope_means_the_requested_scopes_were_granted(
        self, openai_auth: respx.MockRouter
    ) -> None:
        params = _start()
        response = fakes.token_response(nonce=params["nonce"])
        body = json.loads(response.content)
        del body["scope"]
        openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
            return_value=httpx.Response(200, json=body)
        )

        outcome = await chatgpt_auth.complete_login(
            {"state": params["state"], "code": "c", "client_id": fakes.ISSUED_CLIENT_ID}
        )

        assert outcome == "connected"
        record = chatgpt_auth.load_record()
        assert record["scopes"] == sorted(chatgpt_auth.SCOPES)
        assert not record.get("plan_declined")

    async def test_an_explicitly_reduced_scope_is_still_honored(
        self, openai_auth: respx.MockRouter
    ) -> None:
        params = _start()
        openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
            return_value=fakes.token_response(
                nonce=params["nonce"], scope="openid profile email"
            )
        )

        outcome = await chatgpt_auth.complete_login(
            {"state": params["state"], "code": "c", "client_id": fakes.ISSUED_CLIENT_ID}
        )

        assert outcome == "plan_declined"
        assert "access_token" not in chatgpt_auth.load_record()


# ---------------------------------------------------------------------------
# Refresh rotation, serialization, sign-out and status
# ---------------------------------------------------------------------------
