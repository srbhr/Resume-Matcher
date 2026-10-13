"""Requests for a host the app does not serve are rejected (DNS rebinding guard)."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.host_guard import HostGuardMiddleware, host_name
from app.main import app

OLLAMA_REDIRECT = {
    "provider": "ollama",
    "model": "llama3",
    "api_base": "http://attacker.example:11434",
}


def _client(target: FastAPI = app) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=target), base_url="http://test")


class TestRealApp:
    @patch("app.routers.config._log_llm_health_check", new_callable=AsyncMock)
    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config", return_value={})
    async def test_config_put_for_a_foreign_host_is_rejected(
        self, mock_load, mock_save, mock_log_health
    ):
        async with _client() as client:
            resp = await client.put(
                "/api/v1/config/llm-api-key",
                json=OLLAMA_REDIRECT,
                headers={"Host": "attacker.example"},
            )
        assert resp.status_code == 400
        mock_save.assert_not_called()

    @patch("app.routers.config._log_llm_health_check", new_callable=AsyncMock)
    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config", return_value={})
    async def test_rebound_request_through_the_frontend_proxy_is_rejected(
        self, mock_load, mock_save, mock_log_health
    ):
        # The Next.js proxy sends the backend's own address as Host and the
        # browser's Host as X-Forwarded-Host.
        async with _client() as client:
            resp = await client.put(
                "/api/v1/config/llm-api-key",
                json=OLLAMA_REDIRECT,
                headers={
                    "Host": "127.0.0.1:8000",
                    "X-Forwarded-Host": "attacker.example:3000",
                },
            )
        assert resp.status_code == 400
        mock_save.assert_not_called()

    @pytest.mark.parametrize(
        "headers",
        [
            {"Host": "localhost:8000"},
            {"Host": "127.0.0.1:8000"},
            {"Host": "[::1]:8000"},
            {"Host": "127.0.0.1:8000", "X-Forwarded-Host": "localhost:3000"},
        ],
    )
    async def test_local_hosts_are_served(self, headers: dict[str, str]):
        async with _client() as client:
            resp = await client.get("/api/v1/health", headers=headers)
        assert resp.status_code == 200


async def _status(allowed: list[str], headers: dict[str, str]) -> int:
    probe = FastAPI()
    probe.get("/")(lambda: {})
    probe.add_middleware(HostGuardMiddleware, allowed_hosts=allowed)
    async with _client(probe) as client:
        return (await client.get("/", headers=headers)).status_code


class TestMiddleware:
    async def test_every_forwarded_host_must_be_allowed(self):
        headers = {"Host": "localhost", "X-Forwarded-Host": "localhost, evil.example"}
        assert await _status(["localhost"], headers) == 400

    async def test_wildcard_allows_any_host(self):
        assert await _status(["*"], {"Host": "192.168.1.20:3000"}) == 200

    async def test_missing_host_is_rejected(self):
        assert await _status(["localhost"], {"Host": ""}) == 400


class TestSettings:
    def test_backend_binds_loopback_by_default(self):
        assert Settings.model_fields["host"].default == "127.0.0.1"

    def test_default_hosts_are_loopback_and_the_frontend_host(self):
        hosts = Settings(
            allowed_hosts="", frontend_base_url="http://localhost:3000"
        ).effective_allowed_hosts
        assert hosts == ["127.0.0.1", "::1", "localhost"]

    def test_frontend_base_url_and_allowed_hosts_are_added(self):
        hosts = Settings(
            allowed_hosts=" 192.168.1.20 , resume.lan ",
            frontend_base_url="https://Resume.Example.com/app",
        ).effective_allowed_hosts
        assert {"resume.example.com", "192.168.1.20", "resume.lan"} <= set(hosts)
        assert "attacker.example" not in hosts

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("LOCALHOST:3000", "localhost"),
            ("[::1]:8000", "::1"),
            ("127.0.0.1", "127.0.0.1"),
            ("[::1", ""),
        ],
    )
    def test_host_name(self, value: str, expected: str):
        assert host_name(value) == expected
