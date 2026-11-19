"""complete_json names its operation for the duration of the call, and only then."""

from types import SimpleNamespace
from typing import Any

import pytest

from app import llm


class RecordingRouter:
    """A LiteLLM Router stand-in that records the operation seen during each call."""

    def __init__(self) -> None:
        self.seen: list[str | None] = []

    async def acompletion(self, **_kwargs: Any) -> Any:
        self.seen.append(llm.current_operation())
        message = SimpleNamespace(content='{"keywords": []}', reasoning_content=None)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=message, finish_reason="stop")], usage=None
        )


async def test_the_label_is_visible_during_the_call_and_cleared_after(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    router = RecordingRouter()
    config = llm.LLMConfig(provider="openai", model="gpt-4o", api_key="synthetic")
    monkeypatch.setattr(llm, "get_router", lambda _config=None: (router, config))

    await llm.complete_json("Q", schema_type="keywords", operation="job_keywords")
    await llm.complete_json("Q", schema_type="keywords")

    assert router.seen == ["job_keywords", None]
    assert llm.current_operation() is None


async def test_a_failed_call_still_clears_the_label(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FailingRouter:
        async def acompletion(self, **_kwargs: Any) -> Any:
            raise RuntimeError("provider down")

    config = llm.LLMConfig(provider="openai", model="gpt-4o", api_key="synthetic")
    monkeypatch.setattr(
        llm, "get_router", lambda _config=None: (FailingRouter(), config)
    )

    with pytest.raises(Exception):  # noqa: B017 - only the cleanup matters here
        await llm.complete_json("Q", operation="job_keywords")
    assert llm.current_operation() is None
