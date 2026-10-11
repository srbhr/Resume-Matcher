"""ChatGPT plan inference over OpenAI's public Responses API.

Uses the access token from Sign in with ChatGPT (see ``app.chatgpt_auth``) as a
bearer credential for ``POST https://api.openai.com/v1/responses``, as the
open-source plan-usage docs specify: ``store: false`` and ``stream: true`` on
every request, the stream read through ``response.completed``, instructions in
``instructions`` instead of system-role items, and none of the fields the route
rejects (``temperature``, ``max_output_tokens``, ``metadata``, ``truncation``,
``user``, ...). Never ``chatgpt.com/backend-api``.

Why a direct httpx request rather than LiteLLM: LiteLLM 1.104's Responses
client fakes streaming for any model missing from its model registry. It drops
``stream: true`` from the body and synthesizes events from a buffered reply.
The model slugs here come from each account's ``/v1/models`` catalog and are
often not in that registry, while ``stream: true`` is mandatory on this route.
LiteLLM's stream wrapper also hides the ``response.failed`` error codes that
the docs ask apps to act on.

Returns a LiteLLM-shaped response object so ``app/llm.py`` needs no other
changes, like the Claude Code CLI provider.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import httpx

from app.chatgpt_auth import get_access_token

logger = logging.getLogger(__name__)

API_BASE = "https://api.openai.com/v1"
RESPONSES_URL = f"{API_BASE}/responses"
MODELS_URL = f"{API_BASE}/models"
DEFAULT_TIMEOUT_SECONDS = 120.0


class ChatGPTPlanError(RuntimeError):
    """A plan-usage request failed. ``code`` is OpenAI's error code when given."""

    def __init__(self, code: str, status_code: int | None = None) -> None:
        status = f"HTTP {status_code}, " if status_code else ""
        super().__init__(f"ChatGPT plan request failed ({status}code: {code})")
        self.code = code
        self.status_code = status_code


def _flatten_content(content: Any) -> str:
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    return content if isinstance(content, str) else ""


def build_request_body(model: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
    """Translate chat messages into the documented Responses request body.

    System and developer messages become ``instructions``; explicit
    system-role input items are rejected on this route.
    """
    instructions: list[str] = []
    items: list[dict[str, str]] = []
    for message in messages:
        text = _flatten_content(message.get("content"))
        if not text:
            continue
        role = message.get("role")
        if role in ("system", "developer"):
            instructions.append(text)
        elif role in ("user", "assistant"):
            items.append({"role": role, "content": text})
    body: dict[str, Any] = {
        "model": model,
        "input": items,
        "store": False,
        "stream": True,
    }
    if instructions:
        body["instructions"] = "\n\n".join(instructions)
    return body


def _http_error(response: httpx.Response) -> ChatGPTPlanError:
    """Map a rejected request to its error code; diagnostics go to the log."""
    code = f"http_{response.status_code}"
    detail: Any = None
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and isinstance(error.get("code"), str):
            code = error["code"]
            detail = error.get("message")
        else:
            # Direct-route admission failures send {"detail": "..."} instead.
            detail = body.get("detail")
    logger.warning(
        "ChatGPT plan request rejected: HTTP %s, code %s, request id %s, detail %s",
        response.status_code,
        code,
        response.headers.get("x-request-id"),
        str(detail)[:300] if detail else None,
    )
    return ChatGPTPlanError(code, response.status_code)


async def _events(response: httpx.Response) -> AsyncIterator[dict[str, Any]]:
    """Parse a server-sent event stream into JSON event objects."""
    data: list[str] = []

    def decode() -> dict[str, Any] | None:
        payload = "\n".join(data)
        data.clear()
        if not payload or payload == "[DONE]":
            return None
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            return None
        return event if isinstance(event, dict) else None

    async for line in response.aiter_lines():
        if line.startswith("data:"):
            data.append(line[5:].removeprefix(" "))
        elif not line and data:
            event = decode()
            if event is not None:
                yield event
    if data:
        event = decode()
        if event is not None:
            yield event


def _output_text(response: Any) -> str | None:
    """The assistant text from a completed response object, if present."""
    if not isinstance(response, dict) or not isinstance(response.get("output"), list):
        return None
    parts = [
        part.get("text", "")
        for item in response["output"]
        if isinstance(item, dict) and item.get("type") == "message"
        for part in item.get("content") or []
        if isinstance(part, dict) and part.get("type") == "output_text"
    ]
    return "".join(parts) if parts else None


async def _read_completion(response: httpx.Response) -> str:
    """Read the stream; succeed only on ``response.completed``."""
    deltas: list[str] = []
    async for event in _events(response):
        kind = event.get("type")
        if kind == "response.output_text.delta":
            delta = event.get("delta")
            if isinstance(delta, str):
                deltas.append(delta)
        elif kind == "response.completed":
            final = _output_text(event.get("response"))
            return final if final is not None else "".join(deltas)
        elif kind == "response.failed":
            failed = event.get("response")
            error = failed.get("error") if isinstance(failed, dict) else None
            code = error.get("code") if isinstance(error, dict) else None
            raise ChatGPTPlanError(str(code or "response_failed"))
        elif kind == "response.incomplete":
            raise ChatGPTPlanError("response_incomplete")
        elif kind == "error":
            raise ChatGPTPlanError(str(event.get("code") or "stream_error"))
    raise ChatGPTPlanError("stream_ended_without_completion")


def _shape_response(content: str, model: str) -> SimpleNamespace:
    """Build a minimal object that quacks like a LiteLLM ModelResponse."""
    message = SimpleNamespace(
        content=content, reasoning_content=None, thinking=None, role="assistant"
    )
    choice = SimpleNamespace(
        message=message, finish_reason="stop", text=None, delta=None, index=0
    )
    return SimpleNamespace(choices=[choice], model=model, usage=None)


async def chatgpt_acompletion(model: str, **kwargs: Any) -> SimpleNamespace:
    """Drop-in for ``router.acompletion`` when the provider is ``chatgpt``.

    Only ``messages`` and ``timeout`` are read. ``temperature``, ``max_tokens``,
    ``reasoning_effort``, ``response_format``, ``api_key`` and ``api_base`` are
    deliberately ignored: the plan route rejects the sampling and output-length
    fields, and the bearer token comes from the sign-in store. ``timeout``
    bounds the whole call, including a token refresh.
    """
    body = build_request_body(model, kwargs.get("messages") or [])
    timeout = float(kwargs.get("timeout") or DEFAULT_TIMEOUT_SECONDS)
    async with asyncio.timeout(timeout):
        token = await get_access_token()
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
            async with client.stream(
                "POST",
                RESPONSES_URL,
                json=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "text/event-stream",
                },
            ) as response:
                if response.status_code != 200:
                    await response.aread()
                    raise _http_error(response)
                content = await _read_completion(response)
    return _shape_response(content, model)


async def list_models() -> list[dict[str, str]]:
    """The signed-in account's model picker, in the server's order."""
    token = await get_access_token()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            MODELS_URL, headers={"Authorization": f"Bearer {token}"}
        )
    if response.status_code != 200:
        raise _http_error(response)
    payload = response.json()
    models = payload.get("models") if isinstance(payload, dict) else None
    return [
        {
            "slug": model["slug"],
            "display_name": model["display_name"]
            if isinstance(model.get("display_name"), str) and model["display_name"]
            else model["slug"],
        }
        for model in models or []
        if isinstance(model, dict)
        and model.get("visibility") == "list"
        and isinstance(model.get("slug"), str)
    ]
