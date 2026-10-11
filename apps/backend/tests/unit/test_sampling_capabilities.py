"""LiteLLM registry data decides whether a request may carry a temperature."""

from collections.abc import Iterator
from contextlib import AbstractContextManager, contextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm import (
    LLMConfig,
    _apply_reasoning_effort,
    _supports_temperature,
    complete,
    complete_json,
)


@pytest.mark.parametrize("reasoning_capability", [None, "true", 1])
def test_unknown_reasoning_capability_omits_flexible_sampling(
    reasoning_capability: Any,
) -> None:
    model_info = {
        "supported_openai_params": ["temperature"],
        "supports_reasoning": reasoning_capability,
        "supports_none_reasoning_effort": True,
        "default_reasoning_effort": "none",
    }
    with patch("app.llm.litellm.get_model_info", return_value=model_info):
        assert not _supports_temperature("gpt-5.1", 0.7, reasoning_effort=None)
        assert _supports_temperature("gpt-5.1", 1.0, reasoning_effort=None)


def test_registry_flag_without_sampling_omits_temperature() -> None:
    model_info = {"key": "claude-opus-5-5", "supported_openai_params": ["temperature"]}
    with (
        patch("app.llm.litellm.get_model_info", return_value=model_info),
        patch.dict(
            "app.llm.litellm.model_cost",
            {"claude-opus-5-5": {"supports_sampling_params": False}},
        ),
    ):
        assert not _supports_temperature("anthropic/claude-opus-5-5", 0.7)


def _registry(key: str, **flags: Any) -> AbstractContextManager[None]:
    """Pin LiteLLM's registry entry for ``key`` so the tests do not follow the
    installed LiteLLM version's model map."""
    return _patched_registry(
        {"key": key, "supported_openai_params": ["temperature"]}, {key: flags}
    )


@contextmanager
def _patched_registry(
    model_info: dict[str, Any], model_cost: dict[str, Any]
) -> Iterator[None]:
    with (
        patch("app.llm.litellm.get_model_info", return_value=model_info),
        patch.dict("app.llm.litellm.model_cost", model_cost),
    ):
        yield


@pytest.mark.parametrize(
    "flags",
    [{}, {"supports_sampling_params": True}, {"max_output_tokens": 64000}],
)
def test_model_without_the_no_sampling_flag_keeps_temperature(
    flags: dict[str, Any],
) -> None:
    with _registry("claude-sonnet-4-5", **flags):
        assert _supports_temperature("anthropic/claude-sonnet-4-5", 0.7)


def test_model_info_without_a_registry_key_keeps_temperature() -> None:
    model_info = {"supported_openai_params": ["temperature"]}
    with _patched_registry(model_info, {}):
        assert _supports_temperature("openai/custom-model", 0.7)


def test_opus_4_substring_rule_still_applies_without_the_registry_flag() -> None:
    """Opus 4.x carries no flag in LiteLLM's map; the name rule must keep it out."""
    with _registry("claude-opus-4-5"):
        assert not _supports_temperature("anthropic/claude-opus-4-5", 0.7)


async def _sent_kwargs(
    config: LLMConfig, *, json_call: bool = False, max_tokens: int = 4096
) -> dict[str, Any]:
    """Run one completion against a fake router and return what it was sent."""
    choice = MagicMock()
    choice.message.content = '{"ok": true}'
    response = MagicMock()
    response.choices = [choice]
    router = MagicMock()
    router.acompletion = AsyncMock(return_value=response)
    with (
        patch("app.llm.get_router", return_value=(router, config)),
        patch("app.llm._supports_json_mode", return_value=False),
    ):
        if json_call:
            await complete_json(
                prompt="Hi", max_tokens=max_tokens, schema_type="keywords"
            )
        else:
            await complete(prompt="Hi", max_tokens=max_tokens, temperature=0.1)
    return router.acompletion.call_args.kwargs


@pytest.mark.parametrize("json_call", [False, True])
async def test_request_to_a_model_without_sampling_carries_no_temperature(
    json_call: bool,
) -> None:
    config = LLMConfig(provider="anthropic", model="claude-opus-5-5", api_key="k")
    with _registry("claude-opus-5-5", supports_sampling_params=False):
        kwargs = await _sent_kwargs(config, json_call=json_call)

    assert "temperature" not in kwargs


@pytest.mark.parametrize("json_call", [False, True])
async def test_request_to_a_normal_model_keeps_temperature(json_call: bool) -> None:
    config = LLMConfig(provider="anthropic", model="claude-sonnet-4-5", api_key="k")
    with _registry("claude-sonnet-4-5"):
        kwargs = await _sent_kwargs(config, json_call=json_call)

    assert kwargs["temperature"] == pytest.approx(0.1)


async def test_anthropic_thinking_still_drops_temperature_on_a_sampling_model() -> None:
    """The sampling check lets the model keep temperature; extended thinking must
    still remove it, and only when the effort is actually sent."""
    config = LLMConfig(
        provider="anthropic",
        model="claude-sonnet-4-5",
        api_key="k",
        reasoning_effort="medium",
    )
    with _registry("claude-sonnet-4-5"):
        thinking = await _sent_kwargs(config, max_tokens=4096)
        too_small_for_thinking = await _sent_kwargs(config, max_tokens=500)

    assert thinking["reasoning_effort"] == "medium"
    assert "temperature" not in thinking
    assert "reasoning_effort" not in too_small_for_thinking
    assert too_small_for_thinking["temperature"] == pytest.approx(0.1)


@pytest.mark.parametrize(
    ("provider", "temperature_kept"), [("anthropic", False), ("openai", True)]
)
def test_apply_reasoning_effort_drops_temperature_only_on_anthropic(
    provider: str, temperature_kept: bool
) -> None:
    config = LLMConfig(provider=provider, model="m", api_key="k")
    kwargs: dict[str, Any] = {"temperature": 0.1}

    _apply_reasoning_effort(config, kwargs, "medium", 4096)

    assert kwargs["reasoning_effort"] == "medium"
    assert ("temperature" in kwargs) is temperature_kept
