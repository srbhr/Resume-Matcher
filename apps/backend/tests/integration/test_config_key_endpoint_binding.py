"""A saved API key must not follow an unauthenticated request to a new endpoint.

The API has no authentication, so anyone who can reach it could otherwise set
``api_base`` to a server they control and receive the stored provider key on
the next test or completion call.
"""

from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Database
from app.main import app

EVIL = "http://attacker.example/v1"
KEY = "sk-real-openai-key-123456"


@pytest.fixture
def key_store(
    isolated_db: Database, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[Database]:
    import app.config as config_module
    from app import crypto
    from app.config import settings
    from app.config_cache import invalidate_config_cache

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "llm_api_key", "")
    monkeypatch.setattr(settings, "llm_api_base", None)
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", tmp_path / "config.json")
    crypto.reset_cache()
    invalidate_config_cache()
    yield isolated_db
    crypto.reset_cache()
    invalidate_config_cache()


@pytest.fixture
async def client(key_store: Database) -> AsyncIterator[AsyncClient]:
    del key_store
    with patch("app.routers.config._log_llm_health_check", new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as http:
            saved = await http.post("/api/v1/config/api-keys", json={"openai": KEY})
            assert saved.status_code == 200
            configured = await http.put(
                "/api/v1/config/llm-api-key",
                json={"provider": "openai", "model": "gpt-4o-mini", "api_base": None},
            )
            assert configured.status_code == 200
            yield http


async def test_llm_test_does_not_send_saved_key_to_a_new_endpoint(
    client: AsyncClient,
) -> None:
    with patch("app.routers.config.check_llm_health", new_callable=AsyncMock) as probe:
        resp = await client.post(
            "/api/v1/config/llm-test", json={"provider": "openai", "api_base": EVIL}
        )
    assert resp.status_code == 200
    assert resp.json()["healthy"] is False
    assert resp.json()["error_code"] == "api_key_required_for_endpoint"
    probe.assert_not_awaited()


async def test_llm_test_uses_saved_key_on_its_saved_endpoint(
    client: AsyncClient,
) -> None:
    with patch("app.routers.config.check_llm_health", new_callable=AsyncMock) as probe:
        probe.return_value = {"healthy": True}
        resp = await client.post("/api/v1/config/llm-test", json={"provider": "openai"})
    assert resp.status_code == 200
    assert probe.await_args.args[0].api_key == KEY


async def test_moving_the_saved_key_to_a_new_endpoint_requires_the_key(
    client: AsyncClient,
) -> None:
    for attempt in ({}, {"api_key": "sk-wrong"}):
        resp = await client.put(
            "/api/v1/config/llm-api-key",
            json={"provider": "openai", "api_base": EVIL, **attempt},
        )
        assert resp.status_code == 422
        assert resp.json()["detail"]["code"] == "api_key_required_for_endpoint"

    current = await client.get("/api/v1/config/llm-api-key")
    assert current.json()["api_base"] is None


async def test_switching_provider_onto_the_saved_custom_endpoint_requires_the_key(
    client: AsyncClient,
) -> None:
    await client.post("/api/v1/config/api-keys", json={"anthropic": "sk-ant-key-9999"})
    moved = await client.put(
        "/api/v1/config/llm-api-key",
        json={
            "provider": "openai",
            "api_base": "http://proxy.example/v1",
            "api_key": KEY,
        },
    )
    assert moved.status_code == 200

    resp = await client.put(
        "/api/v1/config/llm-api-key",
        json={"provider": "anthropic", "api_base": "http://proxy.example/v1"},
    )
    assert resp.status_code == 422


async def test_the_key_owner_can_move_it_and_then_test_it(client: AsyncClient) -> None:
    proxy = "http://proxy.example/v1"
    resp = await client.put(
        "/api/v1/config/llm-api-key",
        json={"provider": "openai", "api_base": proxy, "api_key": KEY},
    )
    assert resp.status_code == 200
    assert resp.json()["api_base"] == proxy

    with patch("app.routers.config.check_llm_health", new_callable=AsyncMock) as probe:
        probe.return_value = {"healthy": True}
        await client.post("/api/v1/config/llm-test", json={"api_base": proxy})
    assert probe.await_args.args[0].api_key == KEY


async def test_keyless_local_server_needs_no_key(client: AsyncClient) -> None:
    resp = await client.put(
        "/api/v1/config/llm-api-key",
        json={"provider": "ollama", "api_base": "http://localhost:11434"},
    )
    assert resp.status_code == 200
