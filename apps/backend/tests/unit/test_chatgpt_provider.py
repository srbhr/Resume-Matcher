"""The ``chatgpt`` provider wired through llm.py: routing, JSON and health.

``complete``/``complete_json``/``check_llm_health`` run for real against a
respx fake of the Responses API, so the assertions cover the request that
would actually leave the machine.
"""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx
import pytest
import respx

from app import chatgpt_auth, chatgpt_inference, llm
from app.llm import LLMConfig
from tests import chatgpt_fakes as fakes
from tests.unit.test_chatgpt_inference import (
    REJECTED_FIELDS,
    completed,
    sse,
    stream_response,
)

#: In LiteLLM's registry with response_format and temperature support, so only
#: the provider guard keeps JSON mode and sampling out of the request.
REGISTERED_SLUG = "gpt-5.5"


def _config(model: str = REGISTERED_SLUG) -> LLMConfig:
    return LLMConfig(provider="chatgpt", model=model, api_key="")


@pytest.fixture(autouse=True)
def _reset() -> Iterator[None]:
    chatgpt_auth.reset_state()
    yield
    chatgpt_auth.reset_state()


@pytest.fixture
def connected() -> None:
    fakes.save_connected_record(access_token="plan-token")


def _bodies(route: respx.Route) -> list[dict]:
    return [json.loads(call.request.content) for call in route.calls]


def _assert_compliant(body: dict) -> None:
    assert body["store"] is False
    assert body["stream"] is True
    assert not REJECTED_FIELDS & body.keys()
    assert "response_format" not in body and "text" not in body
    assert all(item.get("role") != "system" for item in body["input"])


class TestWiring:
    def test_no_litellm_router_is_built(self) -> None:
        router, config = llm.get_router(_config())
        assert router is None
        assert config.provider == "chatgpt"

    def test_no_output_token_parameter(self) -> None:
        assert llm._output_token_kwarg(_config(), 4096) == {}

    def test_never_falls_back_to_the_env_api_key(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(llm.settings, "llm_api_key", "sk-paid-openai-key")
        assert llm.resolve_api_key({}, "chatgpt") == ""

    def test_registry_would_otherwise_offer_json_mode(self) -> None:
        # Guards the premise of the JSON test below.
        assert llm._supports_json_mode(llm.get_model_name(_config())) is True


class TestCompletions:
    async def test_complete_sends_a_compliant_request(self, connected: None) -> None:
        with respx.mock() as router:
            route = router.post(chatgpt_inference.RESPONSES_URL).mock(
                return_value=stream_response(sse(completed("Tailored text")))
            )
            text = await llm.complete(
                "Rewrite this.", system_prompt="Be concise.", config=_config()
            )
        assert text == "Tailored text"
        (body,) = _bodies(route)
        _assert_compliant(body)
        assert body["model"] == REGISTERED_SLUG
        assert body["instructions"] == "Be concise."
        assert body["input"] == [{"role": "user", "content": "Rewrite this."}]
        assert route.calls.last.request.headers["authorization"] == "Bearer plan-token"

    async def test_complete_json_uses_prompt_only_json(
        self, connected: None, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen: list[dict] = []

        async def spy(model_slug: str, **kwargs: object) -> object:
            seen.append(kwargs)
            return await chatgpt_inference.chatgpt_acompletion(model_slug, **kwargs)

        monkeypatch.setattr(llm, "chatgpt_acompletion", spy)
        with respx.mock() as router:
            route = router.post(chatgpt_inference.RESPONSES_URL).mock(
                side_effect=[
                    stream_response(sse(completed("not json at all"))),
                    stream_response(sse(completed('```json\n{"ok": true}\n```'))),
                ]
            )
            result = await llm.complete_json(
                "Extract.",
                system_prompt="You extract.",
                config=_config(),
                schema_type="keywords",
            )
        assert result == {"ok": True}
        bodies = _bodies(route)
        assert len(bodies) == 2  # the existing retry loop recovered
        for body in bodies:
            _assert_compliant(body)
            assert "valid JSON only" in body["instructions"]
        assert "IMPORTANT" in bodies[1]["input"][0]["content"]
        # Decided in llm.py, not just dropped by the transport: no JSON mode
        # and no output cap are even requested for this provider.
        for kwargs in seen:
            assert "response_format" not in kwargs
            assert "max_tokens" not in kwargs
            assert "max_completion_tokens" not in kwargs


class TestHealthCheck:
    async def test_reports_not_connected_without_calling_openai(self) -> None:
        with respx.mock(assert_all_called=False) as router:
            route = router.post(chatgpt_inference.RESPONSES_URL)
            result = await llm.check_llm_health(_config())
        assert result["healthy"] is False
        assert result["error_code"] == "chatgpt_not_connected"
        assert not route.called

    async def test_uses_the_provider_path_when_connected(self, connected: None) -> None:
        with respx.mock() as router:
            route = router.post(chatgpt_inference.RESPONSES_URL).mock(
                return_value=stream_response(sse(completed("Hi there")))
            )
            result = await llm.check_llm_health(_config(), include_details=True)
        assert result["healthy"] is True
        assert "Hi there" in result["model_output"]
        _assert_compliant(json.loads(route.calls.last.request.content))

    async def test_explains_a_usage_limit(self, connected: None) -> None:
        failed = {
            "type": "response.failed",
            "response": {
                "error": {"code": "subscription_sharing_usage_limit_exceeded"}
            },
        }
        with respx.mock() as router:
            router.post(chatgpt_inference.RESPONSES_URL).mock(
                return_value=stream_response(sse(failed))
            )
            result = await llm.check_llm_health(_config())
        assert result["error_code"] == "chatgpt_usage_limit"

    async def test_a_session_ended_upstream_reads_as_not_connected(
        self, connected: None
    ) -> None:
        fakes.save_connected_record(saved_at=chatgpt_auth.time.time() - 7200)
        with respx.mock() as router:
            router.post(chatgpt_auth.TOKEN_URL).mock(
                return_value=httpx.Response(400, json={"error": "invalid_grant"})
            )
            result = await llm.check_llm_health(_config())
        assert result["error_code"] == "chatgpt_not_connected"
