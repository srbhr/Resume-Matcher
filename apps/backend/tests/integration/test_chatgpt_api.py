"""Sign in with ChatGPT over HTTP: loopback-only sign-in, callback, status, sign-out.

The app runs in-process (ASGITransport); auth.openai.com and the Responses API
are respx fakes.
"""

from __future__ import annotations

from collections.abc import Iterator
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
import respx
from httpx import ASGITransport, AsyncClient

from app import chatgpt_auth, chatgpt_inference
from app.config import settings
from app.main import app
from app.routers.chatgpt import _is_loopback
from tests import chatgpt_fakes as fakes

BACKEND = "http://127.0.0.1:8000"


def client(host: str = "127.0.0.1") -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=app, client=(host, 50000)), base_url=BACKEND
    )


@pytest.fixture(autouse=True)
def _reset() -> Iterator[None]:
    chatgpt_auth.reset_state()
    yield
    chatgpt_auth.reset_state()


@pytest.fixture
def openai_auth() -> Iterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        fakes.mount_discovery(router)
        yield router


def _params(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}


async def _start(http: AsyncClient) -> dict[str, str]:
    response = await http.post("/api/v1/config/chatgpt/login")
    assert response.status_code == 200
    return _params(response.json()["authorization_url"])


class TestLoopbackGuard:
    @pytest.mark.parametrize(
        ("host", "allowed"),
        [
            ("127.0.0.1", True),
            ("127.8.9.10", True),
            ("::1", True),
            ("::ffff:127.0.0.1", True),
            ("10.0.0.5", False),
            ("192.168.1.20", False),
            ("172.17.0.1", False),
            ("localhost", False),
            ("", False),
            (None, False),
        ],
    )
    def test_is_loopback(self, host: str | None, allowed: bool) -> None:
        assert _is_loopback(host) is allowed

    async def test_sign_in_cannot_start_from_another_machine(self) -> None:
        async with client("10.0.0.5") as http:
            response = await http.post("/api/v1/config/chatgpt/login")
        assert response.status_code == 403
        assert "machine running Resume Matcher" in response.json()["detail"]
        assert chatgpt_auth._pending_logins == {}

    async def test_the_callback_refuses_another_machine(self) -> None:
        async with client() as http:
            state = (await _start(http))["state"]
        async with client("192.168.1.20") as http:
            response = await http.get(
                "/auth/callback", params={"state": state, "code": "c"}
            )
        assert response.status_code == 403
        # The refused request did not consume the attempt.
        assert state in chatgpt_auth._pending_logins


class TestSignInFlow:
    async def test_redirect_targets_this_backends_port_on_127_0_0_1(self) -> None:
        async with client() as http:
            params = await _start(http)
        assert params["redirect_uri"] == "http://127.0.0.1:8000/auth/callback"
        assert params["client_id"] == "dynamic_agent_client"

    async def test_sign_in_round_trip(
        self, openai_auth: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:3000/")
        async with client() as http:
            params = await _start(http)
            openai_auth.post(chatgpt_auth.TOKEN_URL).mock(
                return_value=fakes.token_response(
                    nonce=params["nonce"], access_token="tok-access"
                )
            )
            callback = await http.get(
                "/auth/callback",
                params={
                    "code": "auth-code",
                    "state": params["state"],
                    "client_id": fakes.ISSUED_CLIENT_ID,
                    "scope": fakes.ALL_SCOPES,
                },
            )
            status = await http.get("/api/v1/config/chatgpt/status")

        assert callback.status_code == 303
        assert (
            callback.headers["location"]
            == "http://localhost:3000/settings?chatgpt=connected"
        )
        assert callback.headers["cache-control"] == "no-store"
        assert status.json() == {
            "connected": True,
            "email": fakes.EMAIL,
            "plan_declined": False,
        }
        assert "tok-" not in status.text

    async def test_state_mismatch_returns_to_settings_with_an_error(
        self, openai_auth: respx.MockRouter
    ) -> None:
        token = openai_auth.post(chatgpt_auth.TOKEN_URL)
        async with client() as http:
            await _start(http)
            callback = await http.get(
                "/auth/callback", params={"code": "c", "state": "not-ours"}
            )
        assert callback.status_code == 303
        assert callback.headers["location"].endswith("/settings?chatgpt=error")
        assert not token.called

    async def test_declined_consent_returns_cancelled(self) -> None:
        async with client() as http:
            params = await _start(http)
            callback = await http.get(
                "/auth/callback",
                params={"state": params["state"], "error": "access_denied"},
            )
        assert callback.headers["location"].endswith("/settings?chatgpt=cancelled")


class TestSignOutAndModels:
    async def test_logout_revokes_and_disconnects(
        self, openai_auth: respx.MockRouter
    ) -> None:
        fakes.save_connected_record()
        revoke = openai_auth.post(fakes.REVOCATION_URI).mock(
            return_value=httpx.Response(200)
        )
        async with client() as http:
            response = await http.post("/api/v1/config/chatgpt/logout")
            status = await http.get("/api/v1/config/chatgpt/status")
        assert response.json() == {"revoked": True}
        assert revoke.called
        assert status.json()["connected"] is False

    async def test_models_require_a_sign_in(self) -> None:
        async with client() as http:
            response = await http.get("/api/v1/config/chatgpt/models")
        assert response.status_code == 409

    async def test_models_for_the_signed_in_account(self) -> None:
        fakes.save_connected_record()
        with respx.mock() as router:
            router.get(chatgpt_inference.MODELS_URL).mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "models": [
                            {
                                "slug": "m1",
                                "display_name": "Model 1",
                                "visibility": "list",
                            }
                        ]
                    },
                )
            )
            async with client() as http:
                response = await http.get("/api/v1/config/chatgpt/models")
        assert response.json() == {
            "models": [{"slug": "m1", "display_name": "Model 1"}]
        }

    async def test_a_failed_model_list_is_a_generic_error(self) -> None:
        fakes.save_connected_record(access_token="tok-secret")
        with respx.mock() as router:
            router.get(chatgpt_inference.MODELS_URL).mock(
                return_value=httpx.Response(500, json={"error": {"code": "boom"}})
            )
            async with client() as http:
                response = await http.get("/api/v1/config/chatgpt/models")
        assert response.status_code == 502
        assert response.json() == {"detail": "Could not load your ChatGPT models."}
