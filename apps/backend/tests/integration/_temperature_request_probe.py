"""Emit synthetic GPT-5 request bodies through LiteLLM and the OpenAI SDK."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch


def _block_external_io(event: str, args: tuple[object, ...]) -> None:
    """Fail the probe if the mocked SDK transport ever reaches the network."""
    if event in {"socket.connect", "socket.getaddrinfo"}:
        raise RuntimeError(f"temperature contract probe blocked {event}: {args!r}")


sys.addaudithook(_block_external_io)

if "DATA_DIR" not in os.environ or "CONFIG_FILE_PATH" not in os.environ:
    raise RuntimeError("isolated DATA_DIR and CONFIG_FILE_PATH are required")

import httpx  # noqa: E402 - isolation variables must be set before SDK/app imports
import litellm  # noqa: E402 - isolation variables must be set before SDK/app imports
from openai import AsyncOpenAI  # noqa: E402 - isolation must precede SDK import

from app.llm import (  # noqa: E402 - isolation must precede application import
    LLMConfig,
    complete,
    complete_json,
    get_model_name,
)


def _response(content: str) -> SimpleNamespace:
    """Build the complete response shape consumed by application code."""
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content, reasoning_content=None)
            )
        ]
    )


async def _serialize_request(
    application_kwargs: dict[str, Any], model_name: str
) -> dict[str, Any]:
    """Run application kwargs through real LiteLLM/OpenAI serialization."""
    captured: list[dict[str, Any]] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        captured.append(body)
        return httpx.Response(
            200,
            json={
                "id": "synthetic-response",
                "object": "chat.completion",
                "created": 0,
                "model": model_name,
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {
                            "role": "assistant",
                            "content": "synthetic result",
                        },
                    }
                ],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle)
    ) as http_client:
        client = AsyncOpenAI(
            api_key="synthetic-contract-key",
            base_url="https://synthetic.invalid/v1",
            http_client=http_client,
        )
        request_kwargs = dict(application_kwargs)
        request_kwargs["model"] = model_name
        await litellm.acompletion(
            **request_kwargs,
            client=client,
            api_key="synthetic-contract-key",
            api_base="https://synthetic.invalid/v1",
        )

    if len(captured) != 1:
        raise AssertionError(f"expected one SDK request, got {len(captured)}")
    return captured[0]


async def _probe_case(
    provider: str,
    model: str,
    reasoning_effort: str | None,
    temperature: float = 0.7,
) -> dict[str, Any]:
    """Capture complete and malformed-JSON retry requests for one config."""
    config = LLMConfig(
        provider=provider,
        model=model,
        api_key="synthetic-contract-key",
        api_base=(
            "https://synthetic.invalid/v1"
            if provider == "openai_compatible"
            else None
        ),
        reasoning_effort=reasoning_effort,
    )
    model_name = get_model_name(config)

    router = SimpleNamespace(acompletion=AsyncMock(return_value=_response("done")))
    with patch("app.llm.get_router", return_value=(router, config)):
        await complete("synthetic prompt", config=config, temperature=temperature)
    complete_kwargs = dict(router.acompletion.call_args.kwargs)

    router.acompletion = AsyncMock(
        side_effect=[
            _response("malformed"),
            _response("still malformed"),
            _response('{"changes": []}'),
        ]
    )
    with patch("app.llm.get_router", return_value=(router, config)):
        await complete_json(
            "synthetic prompt", config=config, retries=2, schema_type="diff"
        )
    json_kwargs = [dict(call.kwargs) for call in router.acompletion.call_args_list]

    return {
        "provider": provider,
        "model": model,
        "reasoning_effort": reasoning_effort,
        "requested_temperature": temperature,
        "complete": await _serialize_request(complete_kwargs, model_name),
        "json": [
            await _serialize_request(kwargs, model_name) for kwargs in json_kwargs
        ],
    }


async def _main() -> None:
    """Run all approved compatibility scenarios and write stable JSON output."""
    output_path = Path(sys.argv[1])
    cases = [
        ("openai", "gpt-5.1", None, 0.7),
        ("openai", "gpt-5.2", None, 0.7),
        ("openai", "gpt-5-chat-latest", None, 0.7),
        ("openai", "gpt-5.1-chat-latest", None, 0.7),
        ("openai", "gpt-5.2-chat-latest", None, 0.7),
        ("openai", "gpt-5.1", "medium", 0.7),
        ("openai", "gpt-5-nano-2025-08-07", "minimal", 0.7),
        ("openai_compatible", "gpt-5.1", None, 0.7),
        ("openai_compatible", "gpt-5.1", "medium", 0.7),
        ("openai_compatible", "gpt-5-local-llama", None, 0.7),
        ("openai", "gpt-5.1", "medium", 1.0),
    ]
    results = [await _probe_case(*case) for case in cases]
    output_path.write_text(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(_main())
