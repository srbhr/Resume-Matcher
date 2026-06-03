"""Integration tests for health and status endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestHealthEndpoint:
    """GET /api/v1/health — lightweight liveness probe (does NOT call the LLM)."""

    async def test_health_returns_healthy(self, client):
        """Liveness probe always reports healthy and needs no LLM call."""
        async with client:
            resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

    @patch("app.routers.health.check_llm_health", new_callable=AsyncMock)
    async def test_health_is_independent_of_llm(self, mock_health, client):
        """/health is a liveness probe: it stays healthy even when the LLM is
        unhealthy, and must NOT call the provider. Readiness lives at /status.

        Regression guard for the liveness-vs-readiness split — the previous
        version of this test asserted the deleted '/health returns degraded'
        behavior and failed silently because nothing ran the suite.
        """
        mock_health.return_value = {"healthy": False, "error_code": "api_key_missing"}
        async with client:
            resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"
        mock_health.assert_not_awaited()


class TestStatusEndpoint:
    """GET /api/v1/status"""

    @patch("app.routers.health.db", new_callable=AsyncMock)
    @patch("app.routers.health.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.health.get_llm_config")
    async def test_status_ready(self, mock_config, mock_health, mock_db, client):
        mock_config.return_value = type("C", (), {"api_key": "sk-test", "provider": "openai"})()
        mock_health.return_value = {"healthy": True}
        mock_db.get_stats.return_value = {
            "total_resumes": 1,
            "total_jobs": 0,
            "total_improvements": 0,
            "has_master_resume": True,
        }
        async with client:
            resp = await client.get("/api/v1/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ready"
        assert data["llm_healthy"] is True
        assert data["has_master_resume"] is True

    @patch("app.routers.health.db", new_callable=AsyncMock)
    @patch("app.routers.health.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.health.get_llm_config")
    async def test_status_setup_required(self, mock_config, mock_health, mock_db, client):
        mock_config.return_value = type("C", (), {"api_key": "", "provider": "openai"})()
        mock_health.return_value = {"healthy": False}
        mock_db.get_stats.return_value = {
            "total_resumes": 0,
            "total_jobs": 0,
            "total_improvements": 0,
            "has_master_resume": False,
        }
        async with client:
            resp = await client.get("/api/v1/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "setup_required"

    @patch("app.routers.health.db", new_callable=AsyncMock)
    @patch("app.routers.health.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.health.get_llm_config")
    async def test_status_degrades_when_llm_check_fails(
        self, mock_config, mock_health, mock_db, client
    ):
        """A failing LLM health probe degrades llm_healthy, not the endpoint:
        /status still returns 200 and the DB check still runs."""
        mock_config.return_value = type("C", (), {"api_key": "sk-test", "provider": "openai"})()
        mock_health.side_effect = RuntimeError("llm boom")
        mock_db.get_stats.return_value = {
            "total_resumes": 2,
            "total_jobs": 0,
            "total_improvements": 0,
            "has_master_resume": True,
        }
        async with client:
            resp = await client.get("/api/v1/status")
        assert resp.status_code == 200  # not 500
        data = resp.json()
        assert data["llm_healthy"] is False
        assert data["has_master_resume"] is True  # DB check still ran
        assert data["database_stats"]["total_resumes"] == 2

    @patch("app.routers.health.db", new_callable=AsyncMock)
    @patch("app.routers.health.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.health.get_llm_config")
    async def test_status_degrades_when_db_stats_fails(
        self, mock_config, mock_health, mock_db, client
    ):
        """A failing DB stats query degrades its fields, not the endpoint:
        /status still returns 200 and the LLM check still runs."""
        mock_config.return_value = type("C", (), {"api_key": "sk-test", "provider": "openai"})()
        mock_health.return_value = {"healthy": True}
        mock_db.get_stats.side_effect = RuntimeError("db boom")
        async with client:
            resp = await client.get("/api/v1/status")
        assert resp.status_code == 200  # not 500
        data = resp.json()
        assert data["llm_healthy"] is True  # LLM check still ran
        assert data["has_master_resume"] is False
        assert data["database_stats"]["total_resumes"] == 0

    @patch("app.routers.health.db", new_callable=AsyncMock)
    @patch("app.routers.health.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.health.get_llm_config")
    async def test_status_openai_compatible_is_configured_without_key(
        self, mock_config, mock_health, mock_db, client
    ):
        """openai_compatible (like ollama) runs without an API key, so it must
        report llm_configured=True to stay consistent with the health check."""
        mock_config.return_value = type(
            "C", (), {"api_key": "", "provider": "openai_compatible"}
        )()
        mock_health.return_value = {"healthy": True}
        mock_db.get_stats.return_value = {
            "total_resumes": 0,
            "total_jobs": 0,
            "total_improvements": 0,
            "has_master_resume": False,
        }
        async with client:
            resp = await client.get("/api/v1/status")
        assert resp.status_code == 200
        assert resp.json()["llm_configured"] is True
