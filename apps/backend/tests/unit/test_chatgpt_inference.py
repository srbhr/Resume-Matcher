"""ChatGPT plan inference: the Responses request shape.

The Responses endpoint is a respx fake; the request body is asserted against
OpenAI's open-source plan-usage contract (store false, stream true, none of the
rejected fields, no system-role items).
"""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx
import pytest
import respx

from app import chatgpt_auth, chatgpt_inference
from tests import chatgpt_fakes as fakes

#: Fields the plan route rejects (docs: "Preview limitations").
REJECTED_FIELDS = {
    "background",
    "conversation",
    "max_output_tokens",
    "max_tool_calls",
    "metadata",
    "moderation",
    "multi_agent",
    "prompt",
    "prompt_cache_retention",
    "safety_identifier",
    "temperature",
    "top_logprobs",
    "top_p",
    "truncation",
    "user",
    "previous_response_id",
}


def sse(*events: dict, done: bool = False) -> bytes:
    chunks = [f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events]
    if done:
        chunks.append("data: [DONE]\n\n")
    return "".join(chunks).encode()


def completed(text: str) -> dict:
    return {
        "type": "response.completed",
        "response": {
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": text}],
                }
            ],
        },
    }


def stream_response(body: bytes, status: int = 200) -> httpx.Response:
    return httpx.Response(
        status, headers={"content-type": "text/event-stream"}, content=body
    )


@pytest.fixture(autouse=True)
def _connected() -> Iterator[None]:
    chatgpt_auth.reset_state()
    fakes.save_connected_record(access_token="plan-access-token")
    yield
    chatgpt_auth.reset_state()


@pytest.fixture
def responses_api() -> Iterator[respx.Route]:
    with respx.mock() as router:
        yield router.post(chatgpt_inference.RESPONSES_URL)


class TestRequestShape:
    async def test_sends_the_documented_body_and_bearer_token(
        self, responses_api: respx.Route
    ) -> None:
        responses_api.mock(
            return_value=stream_response(sse(completed("Hello"), done=True))
        )

        result = await chatgpt_inference.chatgpt_acompletion(
            "gpt-6.1-sol",
            messages=[
                {"role": "system", "content": "Respond with JSON."},
                {"role": "user", "content": "Parse this resume."},
            ],
            # Everything below must be dropped on this route.
            temperature=0.7,
            max_tokens=4096,
            max_completion_tokens=4096,
            reasoning_effort="low",
            response_format={"type": "json_object"},
            metadata={"a": "b"},
            user="someone",
            api_key="sk-should-never-be-sent",
            api_base="https://example.invalid",
            timeout=30,
        )

        assert result.choices[0].message.content == "Hello"
        request = responses_api.calls.last.request
        assert str(request.url) == "https://api.openai.com/v1/responses"
        assert request.headers["authorization"] == "Bearer plan-access-token"
        body = json.loads(request.content)
        assert body == {
            "model": "gpt-6.1-sol",
            "instructions": "Respond with JSON.",
            "input": [{"role": "user", "content": "Parse this resume."}],
            "store": False,
            "stream": True,
        }
        assert not REJECTED_FIELDS & body.keys()
        assert "response_format" not in body and "text" not in body
        assert b"sk-should-never-be-sent" not in request.content
