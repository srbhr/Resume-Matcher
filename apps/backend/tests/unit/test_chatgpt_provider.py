"""The ``chatgpt`` provider wired through llm.py: routing, JSON and health.

``complete``/``complete_json``/``check_llm_health`` run for real against a
respx fake of the Responses API, so the assertions cover the request that
would actually leave the machine.
"""

from __future__ import annotations

import json
from collections.abc import Iterator

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


class TestCompletions:
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
