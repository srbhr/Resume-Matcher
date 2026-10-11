"""Sign in with ChatGPT routes: cross-site guard on the state-changing POSTs.

``chatgpt_auth`` is faked, so no sign-in, token or network call is made.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app import chatgpt_auth
from app.main import app


@pytest.fixture
def started(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Replace the auth layer; the list records which actions actually ran."""
    ran: list[str] = []

    def fake_start_login(port: int) -> str:
        ran.append("login")
        return "https://auth.openai.com/authorize"

    async def fake_disconnect() -> bool:
        ran.append("logout")
        return True

    monkeypatch.setattr(chatgpt_auth, "start_login", fake_start_login)
    monkeypatch.setattr(chatgpt_auth, "disconnect", fake_disconnect)
    return ran


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.parametrize("path", ["login", "logout"])
class TestCrossSiteGuard:
    @pytest.mark.parametrize(
        "headers",
        [
            {"Origin": "https://evil.example"},
            {"Origin": "null"},
            {"Referer": "https://evil.example/form.html"},
            {"Referer": "not a url"},
            # A page on another host, even when it forges a forwarded host.
            {"Origin": "http://192.168.1.5:3000", "X-Forwarded-Host": "other:3000"},
        ],
    )
    async def test_cross_site_post_is_rejected(
        self, started: list[str], path: str, headers: dict[str, str]
    ) -> None:
        async with _client() as client:
            resp = await client.post(f"/api/v1/config/chatgpt/{path}", headers=headers)

        assert resp.status_code == 403
        assert started == []

    @pytest.mark.parametrize(
        "headers",
        [
            {},  # not a browser page (curl, scripts)
            {"Origin": "http://localhost:3000"},
            {"Origin": "http://127.0.0.1:3100"},
            {"Origin": "http://[::1]:3000"},
            {"Referer": "http://localhost:3000/settings"},
            # Same-origin: the browser's own Host, as the Next.js proxy forwards it.
            {
                "Origin": "http://192.168.1.5:3000",
                "X-Forwarded-Host": "192.168.1.5:3000",
            },
            {"Origin": "http://test"},  # same origin as the request's Host
        ],
    )
    async def test_same_origin_and_loopback_posts_pass(
        self, started: list[str], path: str, headers: dict[str, str]
    ) -> None:
        async with _client() as client:
            resp = await client.post(f"/api/v1/config/chatgpt/{path}", headers=headers)

        assert resp.status_code == 200
        assert started == [path]

    async def test_configured_frontend_origin_passes(
        self,
        started: list[str],
        path: str,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.config import settings

        monkeypatch.setattr(
            settings, "frontend_base_url", "https://resume.example.com/"
        )
        async with _client() as client:
            resp = await client.post(
                f"/api/v1/config/chatgpt/{path}",
                headers={"Origin": "https://resume.example.com"},
            )

        assert resp.status_code == 200
        assert started == [path]


class TestCallbackPort:
    """The loopback redirect targets the port the browser opened the app on."""

    @pytest.mark.parametrize(
        ("headers", "port"),
        [
            # Through the Next.js proxy (Docker publishes only the frontend port).
            ({"Origin": "http://localhost:3000"}, 3000),
            ({"Origin": "http://127.0.0.1:3100"}, 3100),
            ({"Referer": "http://localhost:3000/settings"}, 3000),
            ({"Origin": "http://localhost"}, 80),
            # Anything else keeps the backend's own port (the ASGI server here).
            ({}, 8123),
            (
                {
                    "Origin": "http://192.168.1.5:3000",
                    "X-Forwarded-Host": "192.168.1.5:3000",
                },
                8123,
            ),
            ({"Origin": "https://localhost:3443"}, 8123),
            ({"Origin": "http://localhost:99999"}, 8123),
        ],
    )
    async def test_login_redirect_port(
        self,
        monkeypatch: pytest.MonkeyPatch,
        headers: dict[str, str],
        port: int,
    ) -> None:
        ports: list[int] = []

        def fake_start_login(callback_port: int) -> str:
            ports.append(callback_port)
            return "https://auth.openai.com/authorize"

        monkeypatch.setattr(chatgpt_auth, "start_login", fake_start_login)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test:8123"
        ) as client:
            resp = await client.post("/api/v1/config/chatgpt/login", headers=headers)

        assert resp.status_code == 200
        assert ports == [port]
