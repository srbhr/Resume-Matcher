"""Integration tests for configuration endpoints."""

from unittest.mock import patch, AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestLlmConfig:
    """GET/PUT /api/v1/config/llm-api-key"""

    @patch("app.routers.config._load_config")
    async def test_get_llm_config(self, mock_load, client):
        mock_load.return_value = {
            "provider": "openai",
            "model": "gpt-4",
            "api_key": "sk-1234567890abcdef",
            "api_base": None,
        }
        async with client:
            resp = await client.get("/api/v1/config/llm-api-key")
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "openai"
        # API key should be masked
        assert "****" in data["api_key"] or "*" in data["api_key"]

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_llm_config(self, mock_load, mock_save, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/llm-api-key", json={
                "provider": "anthropic",
                "model": "claude-3-sonnet",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "anthropic"

    @patch("app.routers.config._log_llm_health_check", new_callable=AsyncMock)
    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_llm_config_persists_optional_provider_api_key(
        self, mock_load, mock_save, mock_log_health, client
    ):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/llm-api-key", json={
                "provider": "openai_compatible",
                "model": "llama-3.1-8b",
                "api_key": "local-secret-key",
                "api_base": "http://localhost:8080/v1",
            })

        assert resp.status_code == 200
        saved_config = mock_save.call_args.args[0]
        assert saved_config["provider"] == "openai_compatible"
        assert saved_config["model"] == "llama-3.1-8b"
        assert saved_config["api_key"] == "local-secret-key"
        assert saved_config["api_base"] == "http://localhost:8080/v1"
        data = resp.json()
        assert data["provider"] == "openai_compatible"
        assert data["api_base"] == "http://localhost:8080/v1"
        assert data["api_key"].startswith("loca")
        assert data["api_key"].endswith("-key")
        assert "*" in data["api_key"]
        mock_log_health.assert_awaited_once()


class TestLlmTest:
    """POST /api/v1/config/llm-test"""

    @patch("app.routers.config.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.config._load_config")
    async def test_connection_test_success(self, mock_load, mock_health, client):
        mock_load.return_value = {"provider": "openai", "model": "gpt-4", "api_key": "sk-test"}
        mock_health.return_value = {
            "healthy": True,
            "provider": "openai",
            "model": "gpt-4",
            "test_prompt": "Hi",
            "model_output": "Hello!",
        }
        async with client:
            resp = await client.post("/api/v1/config/llm-test")
        assert resp.status_code == 200
        assert resp.json()["healthy"] is True

    @patch("app.routers.config.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.config._load_config")
    async def test_connection_test_failure(self, mock_load, mock_health, client):
        mock_load.return_value = {}
        mock_health.return_value = {
            "healthy": False,
            "error_code": "api_key_missing",
        }
        async with client:
            resp = await client.post("/api/v1/config/llm-test")
        assert resp.status_code == 200
        assert resp.json()["healthy"] is False

    @patch("app.routers.config.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.config._load_config")
    async def test_connection_test_uses_request_api_key_for_optional_provider(
        self, mock_load, mock_health, client
    ):
        mock_load.return_value = {
            "provider": "openai_compatible",
            "model": "stored-model",
            "api_key": "stored-key",
            "api_base": "http://localhost:8080/v1",
        }
        mock_health.return_value = {
            "healthy": True,
            "provider": "openai_compatible",
            "model": "llama-3.1-8b",
            "test_prompt": "Hi",
            "model_output": "Hello!",
        }
        async with client:
            resp = await client.post("/api/v1/config/llm-test", json={
                "provider": "openai_compatible",
                "model": "llama-3.1-8b",
                "api_key": "typed-local-key",
                "api_base": "http://localhost:1234/v1",
            })

        assert resp.status_code == 200
        config = mock_health.await_args.args[0]
        assert config.provider == "openai_compatible"
        assert config.model == "llama-3.1-8b"
        assert config.api_key == "typed-local-key"
        assert config.api_base == "http://localhost:1234/v1"

    @patch("app.routers.config.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.config._load_config")
    async def test_connection_test_falls_back_to_stored_key_when_request_omits_it(
        self, mock_load, mock_health, client
    ):
        mock_load.return_value = {
            "provider": "openai_compatible",
            "model": "stored-model",
            "api_key": "stored-local-key",
            "api_base": "http://localhost:8080/v1",
        }
        mock_health.return_value = {
            "healthy": True,
            "provider": "openai_compatible",
            "model": "llama-3.1-8b",
            "test_prompt": "Hi",
            "model_output": "Hello!",
        }
        async with client:
            resp = await client.post("/api/v1/config/llm-test", json={
                "provider": "openai_compatible",
                "model": "llama-3.1-8b",
                "api_base": "http://localhost:8080/v1",
            })

        assert resp.status_code == 200
        config = mock_health.await_args.args[0]
        assert config.provider == "openai_compatible"
        assert config.model == "llama-3.1-8b"
        assert config.api_key == "stored-local-key"
        assert config.api_base == "http://localhost:8080/v1"


class TestFeatureConfig:
    """GET/PUT /api/v1/config/features"""

    @patch("app.routers.config._load_config")
    async def test_get_features(self, mock_load, client):
        mock_load.return_value = {
            "enable_cover_letter": True,
            "enable_outreach_message": False,
        }
        async with client:
            resp = await client.get("/api/v1/config/features")
        assert resp.status_code == 200
        data = resp.json()
        assert data["enable_cover_letter"] is True
        assert data["enable_outreach_message"] is False

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_features(self, mock_load, mock_save, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/features", json={
                "enable_cover_letter": True,
            })
        assert resp.status_code == 200
        assert resp.json()["enable_cover_letter"] is True


class TestFeaturePrompts:
    """GET/PUT /api/v1/config/feature-prompts"""

    @patch("app.routers.config._load_config")
    async def test_get_feature_prompts(self, mock_load, client):
        mock_load.return_value = {
            "cover_letter_prompt": "Custom cover prompt",
            "outreach_message_prompt": "",
        }
        async with client:
            resp = await client.get("/api/v1/config/feature-prompts")

        assert resp.status_code == 200
        data = resp.json()
        assert data["cover_letter_prompt"] == "Custom cover prompt"
        assert data["outreach_message_prompt"] == ""
        assert "{job_description}" in data["cover_letter_default"]
        assert "{resume_data}" in data["cover_letter_default"]
        assert "{output_language}" in data["cover_letter_default"]
        assert "{job_description}" in data["outreach_message_default"]
        assert "{resume_data}" in data["outreach_message_default"]
        assert "{output_language}" in data["outreach_message_default"]

    @patch("app.routers.config._load_config")
    async def test_put_feature_prompts_rejects_missing_placeholders(self, mock_load, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/feature-prompts", json={
                "cover_letter_prompt": "Use {job_description} only",
            })

        assert resp.status_code == 422
        assert resp.json()["detail"] == {
            "code": "missing_placeholders",
            "field": "cover_letter_prompt",
            "missing": ["{resume_data}", "{output_language}"],
        }

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_feature_prompts_strips_and_clears_values(
        self, mock_load, mock_save, client
    ):
        mock_load.return_value = {
            "cover_letter_prompt": "Old cover prompt",
            "outreach_message_prompt": "Old outreach prompt",
        }
        async with client:
            resp = await client.put("/api/v1/config/feature-prompts", json={
                "cover_letter_prompt": "  {job_description}\n{resume_data}\n{output_language}\n  ",
                "outreach_message_prompt": "   ",
            })

        assert resp.status_code == 200
        saved_config = mock_save.call_args.args[0]
        assert saved_config["cover_letter_prompt"] == (
            "{job_description}\n{resume_data}\n{output_language}"
        )
        assert saved_config["outreach_message_prompt"] == ""
        data = resp.json()
        assert data["cover_letter_prompt"] == (
            "{job_description}\n{resume_data}\n{output_language}"
        )
        assert data["outreach_message_prompt"] == ""


class TestLanguageConfig:
    """GET/PUT /api/v1/config/language"""

    @patch("app.routers.config._load_config")
    async def test_get_language(self, mock_load, client):
        mock_load.return_value = {"ui_language": "en", "content_language": "es"}
        async with client:
            resp = await client.get("/api/v1/config/language")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ui_language"] == "en"
        assert data["content_language"] == "es"
        assert "en" in data["supported_languages"]

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_invalid_language_returns_400(self, mock_load, mock_save, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/language", json={
                "ui_language": "invalid_lang",
            })
        assert resp.status_code == 400


class TestResetDatabase:
    """POST /api/v1/config/reset"""

    @patch("app.routers.config.db")
    async def test_reset_with_correct_token(self, mock_db, client):
        async with client:
            resp = await client.post("/api/v1/config/reset", json={
                "confirm": "RESET_ALL_DATA",
            })
        assert resp.status_code == 200
        mock_db.reset_database.assert_called_once()

    async def test_reset_without_token_returns_400(self, client):
        async with client:
            resp = await client.post("/api/v1/config/reset", json={
                "confirm": "wrong_token",
            })
        assert resp.status_code == 400

    async def test_reset_missing_body_returns_422(self, client):
        async with client:
            resp = await client.post("/api/v1/config/reset")
        assert resp.status_code == 422
