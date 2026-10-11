"""Sign in with ChatGPT (official open-source flow): PKCE, state and storage.

Every OpenAI endpoint is faked with respx; the conftest socket guard fails any
test that would reach the real network.
"""

from __future__ import annotations

import base64
import hashlib
import os
import stat
from collections.abc import Iterator
from urllib.parse import parse_qs, urlsplit

import pytest

from app import chatgpt_auth
from app.config import settings


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
