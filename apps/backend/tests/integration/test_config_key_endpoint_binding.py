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


ENV_KEY = "sk-operator-env-key-777777"


async def test_deleting_the_confirming_key_does_not_send_llm_api_key_to_the_endpoint(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import llm
    from app.config import settings
    from app.routers import config as config_router

    monkeypatch.setattr(settings, "llm_api_key", ENV_KEY)
    # Replace the saved key with an invented one, confirm the endpoint with
    # it, then delete it so LLM_API_KEY becomes the resolved key.
    await client.post("/api/v1/config/api-keys", json={"openai": "sk-invented"})
    moved = await client.put(
        "/api/v1/config/llm-api-key",
        json={"provider": "openai", "api_base": EVIL, "api_key": "sk-invented"},
    )
    assert moved.status_code == 200
    await client.delete("/api/v1/config/api-keys/openai")

    with patch("app.routers.config.check_llm_health", new_callable=AsyncMock) as probe:
        probe.return_value = {"healthy": True}
        resp = await client.post("/api/v1/config/llm-test")
    assert resp.json().get("error_code") == "api_key_required_for_endpoint"
    probe.assert_not_awaited()

    runtime = llm.get_llm_config()
    assert runtime.api_base == EVIL
    assert runtime.api_key == ""
    assert runtime.endpoint_confirmed is False

    background = config_router._log_llm_health_check
    background.reset_mock()
    resaved = await client.put("/api/v1/config/llm-api-key", json={"model": "gpt-4o"})
    assert resaved.status_code == 200
    sent = background.await_args.args[0]
    assert sent.api_key == ""
    assert sent.endpoint_confirmed is False


async def test_withheld_key_never_leaves_the_process() -> None:
    from app import llm

    config = llm.LLMConfig(
        provider="openai",
        model="gpt-4o-mini",
        api_key="",
        api_base=EVIL,
        endpoint_confirmed=False,
    )
    with patch("app.llm.litellm.acompletion", new_callable=AsyncMock) as sent:
        health = await llm.check_llm_health(config)
        with pytest.raises(ValueError):
            await llm.complete("Hi", config=config)
    assert health["error_code"] == "api_key_required_for_endpoint"
    sent.assert_not_awaited()


async def test_rotating_the_key_in_settings_keeps_the_custom_endpoint_working(
    client: AsyncClient,
) -> None:
    proxy = "http://proxy.example/v1"
    await client.put(
        "/api/v1/config/llm-api-key",
        json={"provider": "openai", "api_base": proxy, "api_key": KEY},
    )
    rotated = "sk-rotated-openai-key-888888"
    # The settings page saves the new key, then the config with that key.
    await client.post("/api/v1/config/api-keys", json={"openai": rotated})
    resp = await client.put(
        "/api/v1/config/llm-api-key",
        json={"provider": "openai", "api_base": proxy, "api_key": rotated},
    )
    assert resp.status_code == 200

    with patch("app.routers.config.check_llm_health", new_callable=AsyncMock) as probe:
        probe.return_value = {"healthy": True}
        await client.post("/api/v1/config/llm-test")
    assert probe.await_args.args[0].api_key == rotated


async def test_base_saved_before_bindings_existed_keeps_working(
    client: AsyncClient,
) -> None:
    import json

    from app import llm
    from app.config import get_config_path

    proxy = "http://proxy.example/v1"
    config_path = get_config_path()
    legacy = json.loads(config_path.read_text(encoding="utf-8"))
    legacy["api_base"] = proxy
    legacy.pop(llm.API_BASE_KEY_BINDING, None)
    config_path.write_text(json.dumps(legacy), encoding="utf-8")

    runtime = llm.get_llm_config()
    assert runtime.api_base == proxy
    assert runtime.api_key == KEY
    assert runtime.endpoint_confirmed is True


async def test_a_case_only_path_change_is_a_new_endpoint(client: AsyncClient) -> None:
    """Paths are case-sensitive: a shared proxy may route /TeamA and /teama apart."""
    owned = "https://proxy.example/TeamA/v1"
    moved = await client.put(
        "/api/v1/config/llm-api-key",
        json={"provider": "openai", "api_base": owned, "api_key": KEY},
    )
    assert moved.status_code == 200

    other_route = "https://proxy.example/teama/v1"
    resp = await client.put(
        "/api/v1/config/llm-api-key",
        json={"provider": "openai", "api_base": other_route},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "api_key_required_for_endpoint"

    with patch("app.routers.config.check_llm_health", new_callable=AsyncMock) as probe:
        tested = await client.post(
            "/api/v1/config/llm-test", json={"api_base": other_route}
        )
    assert tested.json()["error_code"] == "api_key_required_for_endpoint"
    probe.assert_not_awaited()


async def test_host_case_and_trailing_slash_are_the_same_endpoint(
    client: AsyncClient,
) -> None:
    owned = "https://proxy.example/TeamA/v1"
    await client.put(
        "/api/v1/config/llm-api-key",
        json={"provider": "openai", "api_base": owned, "api_key": KEY},
    )
    with patch("app.routers.config.check_llm_health", new_callable=AsyncMock) as probe:
        probe.return_value = {"healthy": True}
        await client.post(
            "/api/v1/config/llm-test",
            json={"api_base": "HTTPS://Proxy.Example/TeamA/v1/"},
        )
    assert probe.await_args.args[0].api_key == KEY
