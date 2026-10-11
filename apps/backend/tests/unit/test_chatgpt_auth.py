"""Sign in with ChatGPT (official open-source flow): PKCE, callback, tokens, storage.

Every OpenAI endpoint is faked with respx; the conftest socket guard fails any
test that would reach the real network.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
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

    def test_missing_or_undecryptable_record_reads_as_empty(self) -> None:
        assert chatgpt_auth.load_record() == {}
        path = settings.data_dir / "chatgpt_credentials.enc"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("not-a-fernet-token")
        assert chatgpt_auth.load_record() == {}


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

    def test_every_attempt_gets_fresh_state_nonce_and_verifier(self) -> None:
        first = _query(chatgpt_auth.start_login(8000))
        second = _query(chatgpt_auth.start_login(8000))

        assert first["state"] != second["state"]
        assert first["nonce"] != second["nonce"]
        assert first["code_challenge"] != second["code_challenge"]
        assert len(first["state"]) >= 32

    def test_host_id_is_persisted_before_sign_in_and_reused(self) -> None:
        first = _query(chatgpt_auth.start_login(8000))
        host_id = first["ext_agent_host_id"]

        assert host_id.startswith("urn:uuid:")
        assert chatgpt_auth.load_record()["ext_agent_host_id"] == host_id
        assert _query(chatgpt_auth.start_login(8000))["ext_agent_host_id"] == host_id

    def test_only_the_port_of_the_redirect_varies(self) -> None:
        params = _query(chatgpt_auth.start_login(54321))
        assert params["redirect_uri"] == "http://127.0.0.1:54321/auth/callback"

    def test_reauthorization_reuses_the_issued_client_id(self) -> None:
        chatgpt_auth.save_record(
            {
                "ext_agent_host_id": "urn:uuid:11111111-1111-4111-8111-111111111111",
                "client_id": "oaiapp_issued",
                "email": "user@example.com",
            }
        )
        params = _query(chatgpt_auth.start_login(8000))

        assert params["client_id"] == "oaiapp_issued"
        assert "agent_name_hint" not in params
        assert params["login_hint"] == "user@example.com"
        assert (
            params["ext_agent_host_id"]
            == "urn:uuid:11111111-1111-4111-8111-111111111111"
        )
        assert (
            chatgpt_auth._pending_logins[params["state"]].client_id == "oaiapp_issued"
        )

    def test_asks_for_consent_again_after_plan_usage_was_declined(self) -> None:
        chatgpt_auth.save_record({"client_id": "oaiapp_issued", "plan_declined": True})
        params = _query(chatgpt_auth.start_login(8000))
        assert params["prompt"] == "consent"
        assert params["scope"].split()[-1] == "chatgpt.tokens.use.direct"

    def test_expired_attempts_are_pruned(self, monkeypatch: pytest.MonkeyPatch) -> None:
        params = _query(chatgpt_auth.start_login(8000))
        clock = chatgpt_auth.time.time() + chatgpt_auth.LOGIN_TTL_SECONDS + 1
        monkeypatch.setattr(chatgpt_auth.time, "time", lambda: clock)
        chatgpt_auth.start_login(8000)
        assert params["state"] not in chatgpt_auth._pending_logins


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

    async def test_declined_consent_ends_the_attempt_without_exchanging(
        self, openai_auth: respx.MockRouter
    ) -> None:
        token = openai_auth.post(chatgpt_auth.TOKEN_URL)
        params = _start()

        with pytest.raises(chatgpt_auth.ChatGPTLoginError) as raised:
            await chatgpt_auth.complete_login(
                {"state": params["state"], "error": "access_denied", "code": "c"}
            )
        assert raised.value.outcome == "cancelled"
        assert not token.called

    async def test_an_error_with_a_forged_state_is_not_reported_as_cancelled(
        self, openai_auth: respx.MockRouter
    ) -> None:
        _start()
        with pytest.raises(chatgpt_auth.ChatGPTLoginError) as raised:
            await chatgpt_auth.complete_login({"state": "x", "error": "access_denied"})
        assert raised.value.outcome == "error"

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

    async def test_state_is_single_use(self, openai_auth: respx.MockRouter) -> None:
        params = _start()
        openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
            return_value=fakes.token_response(nonce=params["nonce"])
        )
        query = {
            "state": params["state"],
            "code": "auth-code",
            "client_id": fakes.ISSUED_CLIENT_ID,
        }
        assert await chatgpt_auth.complete_login(query) == "connected"
        with pytest.raises(chatgpt_auth.ChatGPTLoginError):
            await chatgpt_auth.complete_login(query)

    async def test_new_registration_without_an_issued_client_id_is_incomplete(
        self, openai_auth: respx.MockRouter
    ) -> None:
        token = openai_auth.post(chatgpt_auth.TOKEN_URL)
        for client_id in (None, "dynamic_agent_client"):
            params = _start()
            query = {"state": params["state"], "code": "auth-code"}
            if client_id:
                query["client_id"] = client_id
            with pytest.raises(chatgpt_auth.ChatGPTLoginError):
                await chatgpt_auth.complete_login(query)
        assert not token.called
        assert "client_id" not in chatgpt_auth.load_record()

    async def test_reauthorization_keeps_the_saved_client_id(
        self, openai_auth: respx.MockRouter
    ) -> None:
        chatgpt_auth.save_record(
            {"client_id": fakes.ISSUED_CLIENT_ID, "subject": fakes.SUBJECT}
        )
        params = _start()
        token = openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
            return_value=fakes.token_response(nonce=params["nonce"])
        )
        # The reauthorization callback may omit client_id.
        outcome = await chatgpt_auth.complete_login(
            {"state": params["state"], "code": "auth-code"}
        )
        assert outcome == "connected"
        assert (
            fakes.form(token.calls.last.request)["client_id"] == fakes.ISSUED_CLIENT_ID
        )

    async def test_reauthorization_rejects_a_different_client_id(
        self, openai_auth: respx.MockRouter
    ) -> None:
        chatgpt_auth.save_record({"client_id": fakes.ISSUED_CLIENT_ID})
        params = _start()
        token = openai_auth.post(chatgpt_auth.TOKEN_URL)
        with pytest.raises(chatgpt_auth.ChatGPTLoginError):
            await chatgpt_auth.complete_login(
                {"state": params["state"], "code": "c", "client_id": "oaiapp_other"}
            )
        assert not token.called
        assert chatgpt_auth.load_record()["client_id"] == fakes.ISSUED_CLIENT_ID

    async def test_reauthorization_as_another_account_does_not_replace_credentials(
        self, openai_auth: respx.MockRouter
    ) -> None:
        fakes.save_connected_record(access_token="original")
        params = _start()
        openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
            return_value=fakes.token_response(nonce=params["nonce"], sub="someone-else")
        )
        with pytest.raises(chatgpt_auth.ChatGPTLoginError):
            await chatgpt_auth.complete_login({"state": params["state"], "code": "c"})
        assert chatgpt_auth.load_record()["access_token"] == "original"

    @pytest.mark.parametrize(
        "bad_token",
        [
            {"nonce": "a-different-nonce"},
            {"aud": "oaiapp_someone_else"},
            {"iss": "https://evil.example"},
            {"wrong_key": True},
            {"expires_in": -3600},
        ],
        ids=["nonce", "audience", "issuer", "signature", "expired"],
    )
    async def test_an_invalid_id_token_stores_nothing(
        self, openai_auth: respx.MockRouter, bad_token: dict
    ) -> None:
        params = _start()
        id_kwargs = {"nonce": params["nonce"], **bad_token}
        nonce = id_kwargs.pop("nonce")
        openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
            return_value=fakes.token_response(nonce=nonce, **id_kwargs)
        )
        with pytest.raises(chatgpt_auth.ChatGPTLoginError) as raised:
            await chatgpt_auth.complete_login(
                {
                    "state": params["state"],
                    "code": "c",
                    "client_id": fakes.ISSUED_CLIENT_ID,
                }
            )
        assert raised.value.outcome == "error"
        record = chatgpt_auth.load_record()
        assert "access_token" not in record and "client_id" not in record

    async def test_invalid_grant_discards_the_attempt(
        self, openai_auth: respx.MockRouter
    ) -> None:
        params = _start()
        openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
            return_value=httpx.Response(400, json={"error": "invalid_grant"})
        )
        query = {
            "state": params["state"],
            "code": "c",
            "client_id": fakes.ISSUED_CLIENT_ID,
        }
        with pytest.raises(chatgpt_auth.ChatGPTLoginError):
            await chatgpt_auth.complete_login(query)
        assert params["state"] not in chatgpt_auth._pending_logins
        assert "access_token" not in chatgpt_auth.load_record()

    async def test_sign_in_without_the_plan_scope_keeps_no_tokens(
        self, openai_auth: respx.MockRouter
    ) -> None:
        params = _start()
        openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
            return_value=fakes.token_response(
                nonce=params["nonce"], scope="openid profile email offline_access"
            )
        )
        outcome = await chatgpt_auth.complete_login(
            {"state": params["state"], "code": "c", "client_id": fakes.ISSUED_CLIENT_ID}
        )
        assert outcome == "plan_declined"
        record = chatgpt_auth.load_record()
        assert record["client_id"] == fakes.ISSUED_CLIENT_ID
        assert record["plan_declined"] is True
        assert "access_token" not in record and "refresh_token" not in record


# ---------------------------------------------------------------------------
# Refresh rotation, serialization, sign-out and status
# ---------------------------------------------------------------------------


def _expired() -> dict[str, float]:
    return {"saved_at": chatgpt_auth.time.time() - 7200}


class TestAccessToken:
    async def test_a_fresh_token_is_returned_without_refreshing(self) -> None:
        fakes.save_connected_record(access_token="still-good")
        with respx.mock(assert_all_called=False) as router:
            token = router.post(chatgpt_auth.TOKEN_URL)
            assert await chatgpt_auth.get_access_token() == "still-good"
        assert not token.called

    async def test_refresh_rotates_and_persists_both_tokens(self) -> None:
        fakes.save_connected_record(refresh_token="refresh-old", **_expired())
        with respx.mock() as router:
            token = router.post(chatgpt_auth.TOKEN_URL).mock(
                return_value=fakes.token_response(
                    access_token="access-new", refresh_token="refresh-new"
                )
            )
            assert await chatgpt_auth.get_access_token() == "access-new"

        assert fakes.form(token.calls.last.request) == {
            "grant_type": "refresh_token",
            "client_id": fakes.ISSUED_CLIENT_ID,
            "refresh_token": "refresh-old",
            "resource": "https://api.openai.com/v1",
        }
        record = chatgpt_auth.load_record()
        assert record["access_token"] == "access-new"
        assert record["refresh_token"] == "refresh-new"
        raw = (settings.data_dir / "chatgpt_credentials.enc").read_bytes()
        assert b"refresh-new" not in raw and b"access-new" not in raw

    async def test_concurrent_callers_share_one_refresh(self) -> None:
        fakes.save_connected_record(refresh_token="refresh-old", **_expired())

        async def slow_token_endpoint(request: httpx.Request) -> httpx.Response:
            # Suspend mid-refresh so the other callers really run concurrently.
            await asyncio.sleep(0.05)
            return fakes.token_response(
                access_token="access-new", refresh_token="refresh-new"
            )

        with respx.mock() as router:
            token = router.post(chatgpt_auth.TOKEN_URL).mock(
                side_effect=slow_token_endpoint
            )
            results = await asyncio.gather(
                *(chatgpt_auth.get_access_token() for _ in range(5))
            )
        assert results == ["access-new"] * 5
        # A rotating refresh token must never be spent twice.
        assert token.call_count == 1

    @pytest.mark.skipif(os.name == "nt", reason="POSIX advisory lock")
    async def test_refresh_waits_for_another_process_holding_the_lock(self) -> None:
        import fcntl

        fakes.save_connected_record(**_expired())
        lock_path = settings.data_dir / "chatgpt_credentials.lock"
        other_process = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        fcntl.flock(other_process, fcntl.LOCK_EX)
        try:
            with respx.mock() as router:
                token = router.post(chatgpt_auth.TOKEN_URL).mock(
                    return_value=fakes.token_response(access_token="access-new")
                )
                task = asyncio.create_task(chatgpt_auth.get_access_token())
                await asyncio.sleep(0.3)
                assert not task.done()
                assert not token.called
                os.close(other_process)
                other_process = -1
                assert await asyncio.wait_for(task, 5) == "access-new"
        finally:
            if other_process >= 0:
                os.close(other_process)

    @pytest.mark.parametrize("error", ["invalid_grant", "refresh_token_reused"])
    async def test_a_dead_refresh_token_clears_tokens_but_keeps_the_registration(
        self, error: str
    ) -> None:
        fakes.save_connected_record(**_expired())
        with respx.mock() as router:
            router.post(chatgpt_auth.TOKEN_URL).mock(
                return_value=httpx.Response(400, json={"error": error})
            )
            with pytest.raises(chatgpt_auth.ChatGPTNotConnectedError):
                await chatgpt_auth.get_access_token()
        record = chatgpt_auth.load_record()
        assert "refresh_token" not in record and "access_token" not in record
        assert record["client_id"] == fakes.ISSUED_CLIENT_ID
        assert record["ext_agent_host_id"].startswith("urn:uuid:")
        assert chatgpt_auth.status()["connected"] is False

    async def test_a_temporary_failure_keeps_the_credentials(self) -> None:
        fakes.save_connected_record(refresh_token="refresh-old", **_expired())
        with respx.mock() as router:
            router.post(chatgpt_auth.TOKEN_URL).mock(
                return_value=httpx.Response(
                    503, json={"error": "temporarily_unavailable"}
                )
            )
            with pytest.raises(chatgpt_auth.TokenEndpointError):
                await chatgpt_auth.get_access_token()
        assert chatgpt_auth.load_record()["refresh_token"] == "refresh-old"

    async def test_not_signed_in(self) -> None:
        with pytest.raises(chatgpt_auth.ChatGPTNotConnectedError):
            await chatgpt_auth.get_access_token()


class TestDisconnect:
    @pytest.fixture(autouse=True)
    def _no_backoff(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(chatgpt_auth, "REVOKE_RETRY_DELAYS", (0.0, 0.0))

    async def test_revokes_the_refresh_token_then_clears_tokens(
        self, openai_auth: respx.MockRouter
    ) -> None:
        fakes.save_connected_record(refresh_token="refresh-live")
        revoke = openai_auth.post(fakes.REVOCATION_URI).mock(
            return_value=httpx.Response(200)
        )

        assert await chatgpt_auth.disconnect() is True

        assert fakes.form(revoke.calls.last.request) == {
            "token": "refresh-live",
            "token_type_hint": "refresh_token",
            "client_id": fakes.ISSUED_CLIENT_ID,
        }
        record = chatgpt_auth.load_record()
        for field in ("access_token", "refresh_token", "id_token"):
            assert field not in record
        assert record["client_id"] == fakes.ISSUED_CLIENT_ID
        assert record["ext_agent_host_id"].startswith("urn:uuid:")
        assert chatgpt_auth.status() == {
            "connected": False,
            "email": None,
            "plan_declined": False,
        }

    async def test_retries_a_server_error(self, openai_auth: respx.MockRouter) -> None:
        fakes.save_connected_record()
        revoke = openai_auth.post(fakes.REVOCATION_URI).mock(
            side_effect=[
                httpx.Response(503),
                httpx.ConnectError("down"),
                httpx.Response(200),
            ]
        )
        assert await chatgpt_auth.disconnect() is True
        assert revoke.call_count == 3

    async def test_unconfirmed_revocation_still_signs_out_locally(
        self, openai_auth: respx.MockRouter
    ) -> None:
        fakes.save_connected_record()
        openai_auth.post(fakes.REVOCATION_URI).mock(return_value=httpx.Response(503))
        assert await chatgpt_auth.disconnect() is False
        assert "refresh_token" not in chatgpt_auth.load_record()

    async def test_nothing_to_revoke(self) -> None:
        assert await chatgpt_auth.disconnect() is True
        assert chatgpt_auth.load_record() == {}


class TestStatus:
    def test_connected_status_carries_no_secrets(self) -> None:
        fakes.save_connected_record(access_token="tok-A", refresh_token="tok-R")
        result = chatgpt_auth.status()
        assert result == {
            "connected": True,
            "email": fakes.EMAIL,
            "plan_declined": False,
        }
        assert "tok-" not in repr(result)
        assert chatgpt_auth.is_connected() is True

    def test_declined_plan_usage_is_reported(self) -> None:
        chatgpt_auth.save_record({"client_id": "oaiapp_x", "plan_declined": True})
        assert chatgpt_auth.status() == {
            "connected": False,
            "email": None,
            "plan_declined": True,
        }
