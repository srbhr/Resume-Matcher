"""Agent mode: the user's coding agent does the AI work, the app makes no model calls."""

from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app import llm
from app.config import settings
from app.database import Database
from app.main import app

pytestmark = pytest.mark.integration


async def _select_agent(client: AsyncClient) -> None:
    resp = await client.put("/api/v1/config/llm-api-key", json={"provider": "Agent "})
    assert resp.status_code == 200, resp.text
    assert resp.json()["provider"] == "agent"


async def test_status_reports_agent_mode_and_no_app_model(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A paid key in .env must not make the app look configured for AI.
    monkeypatch.setattr(settings, "llm_api_key", "sk-env-key")
    await isolated_db.create_resume(
        content="", processed_data=sample_resume, is_master=True
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        await _select_agent(client)
        status = (await client.get("/api/v1/status")).json()

    assert status["agent_mode"] is True
    assert status["llm_configured"] is False
    assert status["status"] == "ready"


async def test_status_without_a_master_still_needs_setup() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        await _select_agent(client)
        status = (await client.get("/api/v1/status")).json()
    assert status["agent_mode"] is True
    assert status["status"] == "setup_required"


async def test_other_providers_are_not_agent_mode() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        status = (await client.get("/api/v1/status")).json()
    assert status["agent_mode"] is False


async def test_model_calls_are_refused_without_reaching_a_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    acompletion = AsyncMock()
    monkeypatch.setattr(llm.litellm, "acompletion", acompletion)
    config = llm.LLMConfig(provider="agent", model="", api_key="")

    with pytest.raises(llm.AgentModeError, match="coding agent"):
        await llm.complete("Hi", config=config)
    with pytest.raises(llm.AgentModeError):
        await llm.complete_json("Return {}", config=config)
    health = await llm.check_llm_health(config)

    assert health["healthy"] is False
    assert health["error_code"] == "agent_mode"
    acompletion.assert_not_awaited()
