"""Provider switching preserves configuration without leaking custom endpoints."""

from unittest.mock import AsyncMock

import pytest
from fastapi import BackgroundTasks, HTTPException

from app import chatgpt, llm
from app.config import Settings, settings
from app.routers import config
from app.schemas import LLMConfigRequest


@pytest.fixture
def stored_config(monkeypatch):
    """Keep config persistence realistic while replacing account network access."""
    stored = {
        "provider": "azure_foundry",
        "model": "existing-model",
        "api_base": "https://custom.example/openai/v1",
    }
    monkeypatch.setattr(config, "_load_config", lambda: stored.copy())
    monkeypatch.setattr(llm, "load_config_file", lambda: stored.copy())
    monkeypatch.setattr(config, "_save_config", lambda updated: stored.update(updated))
    monkeypatch.setattr(
        chatgpt, "models", AsyncMock(return_value=[{"id": "account-model"}])
    )
    monkeypatch.setattr(settings, "llm_api_base", "https://env.example/v1")
    return stored


async def test_switching_to_subscription_preserves_endpoint(stored_config):
    """An omitted endpoint survives save, GET, runtime resolution and switching back."""
    tasks = BackgroundTasks()
    saved = await config.update_llm_config(
        LLMConfigRequest(provider="chatgpt", model="account-model"), tasks
    )
    assert stored_config["api_base"] == "https://custom.example/openai/v1"
    assert saved.api_base is None
    assert (await config.get_llm_config_endpoint()).api_base is None
    assert llm.get_llm_config().api_base is None
    # Background health checks receive the same fixed-endpoint subscription config.
    assert tasks.tasks[0].args[0].api_base is None

    restored = await config.update_llm_config(
        LLMConfigRequest(provider="azure_foundry", model="existing-model"),
        BackgroundTasks(),
    )
    assert restored.api_base == "https://custom.example/openai/v1"
    assert llm.get_llm_config().api_base == restored.api_base


@pytest.mark.parametrize("api_base", [None, "", "   "])
async def test_explicit_clear_still_clears_endpoint(stored_config, api_base):
    """Explicit null/blank retains the established API clearing semantics."""
    await config.update_llm_config(
        LLMConfigRequest(provider="chatgpt", model="account-model", api_base=api_base),
        BackgroundTasks(),
    )
    assert stored_config["api_base"] is None


async def test_unsaved_subscription_health_ignores_custom_endpoint(
    stored_config, monkeypatch
):
    """Testing an unsaved provider resolves endpoints for that requested provider."""
    health = AsyncMock(return_value={"healthy": True})
    monkeypatch.setattr(config, "check_llm_health", health)
    await config.test_llm_connection(
        LLMConfigRequest(
            provider="chatgpt",
            model="account-model",
            api_base="https://override.example",
        )
    )
    assert health.call_args.args[0].api_base is None
    assert stored_config["api_base"] == "https://custom.example/openai/v1"


async def test_unsaved_other_provider_health_restores_endpoint(
    stored_config, monkeypatch
):
    """Testing a different provider uses the saved endpoint even before saving."""
    stored_config["provider"] = "chatgpt"
    health = AsyncMock(return_value={"healthy": True})
    monkeypatch.setattr(config, "check_llm_health", health)
    await config.test_llm_connection(LLMConfigRequest(provider="azure_foundry"))
    assert health.call_args.args[0].api_base == stored_config["api_base"]


def test_server_default_preserves_existing_network_deployments():
    """Subscription request guards must not change unrelated listener defaults."""
    assert Settings.model_fields["host"].default == "0.0.0.0"


@pytest.mark.parametrize("status_code", [429, 503])
async def test_subscription_save_preserves_catalog_failure_status(
    stored_config, monkeypatch, status_code
):
    """Saving a model should report rate limits and outages consistently."""
    monkeypatch.setattr(
        chatgpt,
        "models",
        AsyncMock(
            side_effect=chatgpt.ChatGPTError(
                "Catalog unavailable", status_code=status_code
            )
        ),
    )
    with pytest.raises(HTTPException) as caught:
        await config.update_llm_config(
            LLMConfigRequest(provider="chatgpt", model="account-model"),
            BackgroundTasks(),
        )
    assert caught.value.status_code == status_code
    assert stored_config["provider"] == "azure_foundry"


async def test_unchanged_subscription_model_can_save_offline(
    stored_config, monkeypatch
):
    """Unrelated settings changes do not require a fresh provider catalog."""
    stored_config.update(provider="chatgpt", model="account-model")
    catalog = AsyncMock(side_effect=chatgpt.ChatGPTError("Offline", status_code=503))
    monkeypatch.setattr(chatgpt, "models", catalog)
    response = await config.update_llm_config(
        LLMConfigRequest(
            provider="chatgpt", model="account-model", reasoning_effort="low"
        ),
        BackgroundTasks(),
    )
    catalog.assert_not_awaited()
    assert response.reasoning_effort == "low"
    assert stored_config["api_base"] == "https://custom.example/openai/v1"


@pytest.mark.parametrize("model", [None, "", "   "])
async def test_subscription_switch_requires_explicit_model(
    stored_config, monkeypatch, model
):
    """Switching providers cannot reuse an unrelated default model."""
    catalog = AsyncMock()
    monkeypatch.setattr(chatgpt, "models", catalog)
    with pytest.raises(HTTPException) as caught:
        await config.update_llm_config(
            LLMConfigRequest(provider="chatgpt", model=model), BackgroundTasks()
        )
    assert caught.value.status_code == 422
    assert caught.value.detail["field"] == "model"
    catalog.assert_not_awaited()
    assert stored_config["provider"] == "azure_foundry"


@pytest.mark.parametrize("available", [True, False])
async def test_implicit_health_checks_catalog_without_inference(monkeypatch, available):
    """Idle status checks never consume subscription completion quota."""
    catalog = AsyncMock(return_value=[{"id": "account-model"}] if available else [])
    completion = AsyncMock()
    monkeypatch.setattr(chatgpt, "models", catalog)
    monkeypatch.setattr(chatgpt, "complete", completion)
    result = await llm.check_llm_health(
        llm.LLMConfig(provider="chatgpt", model="account-model", api_key="")
    )
    assert result["healthy"] is available
    catalog.assert_awaited_once()
    completion.assert_not_awaited()


async def test_background_save_health_does_not_generate(stored_config, monkeypatch):
    """Running the saved configuration's background task checks only availability."""
    completion = AsyncMock()
    monkeypatch.setattr(chatgpt, "complete", completion)
    tasks = BackgroundTasks()
    await config.update_llm_config(
        LLMConfigRequest(provider="chatgpt", model="account-model"), tasks
    )
    await tasks()
    completion.assert_not_awaited()


@pytest.mark.parametrize(
    "options", [{"include_details": True}, {"test_prompt": "Manual test"}]
)
async def test_explicit_health_check_generates(monkeypatch, options):
    """Users can still test real inference explicitly."""
    completion = AsyncMock(return_value="Works")
    catalog = AsyncMock()
    monkeypatch.setattr(chatgpt, "complete", completion)
    monkeypatch.setattr(chatgpt, "models", catalog)
    result = await llm.check_llm_health(
        llm.LLMConfig(provider="chatgpt", model="account-model", api_key=""), **options
    )
    assert result["healthy"] is True
    completion.assert_awaited_once()
    catalog.assert_not_awaited()


async def test_completion_logging_preserves_safe_transport_failure(monkeypatch, caplog):
    """Diagnostics never reveal exception payloads or change the retry category."""
    failure = chatgpt.ChatGPTError("fake-private-provider-body", status_code=503)
    monkeypatch.setattr(chatgpt, "complete", AsyncMock(side_effect=failure))
    with pytest.raises(chatgpt.ChatGPTError) as caught:
        await llm.complete(
            "fake-private-prompt",
            config=llm.LLMConfig(provider="chatgpt", model="account-model", api_key=""),
        )
    assert caught.value is failure
    assert "ChatGPT completion failed" in caplog.text
    assert "fake-private" not in caplog.text
