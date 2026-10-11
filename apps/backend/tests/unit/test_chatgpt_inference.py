"""ChatGPT plan inference: the Responses request shape and stream handling.

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


def delta(text: str) -> dict:
    return {"type": "response.output_text.delta", "delta": text}


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
            return_value=stream_response(
                sse(delta("Hel"), delta("lo"), completed("Hello"))
            )
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

    def test_system_and_developer_messages_become_instructions(self) -> None:
        body = chatgpt_inference.build_request_body(
            "m",
            [
                {"role": "system", "content": "A"},
                {"role": "developer", "content": [{"type": "text", "text": "B"}]},
                {"role": "user", "content": "Q"},
                {"role": "assistant", "content": "R"},
                {"role": "user", "content": ""},
            ],
        )
        assert body["instructions"] == "A\n\nB"
        assert body["input"] == [
            {"role": "user", "content": "Q"},
            {"role": "assistant", "content": "R"},
        ]
        assert all(item["role"] != "system" for item in body["input"])

    async def test_refreshes_an_expired_token_before_the_request(self) -> None:
        fakes.save_connected_record(
            access_token="stale", saved_at=chatgpt_auth.time.time() - 7200
        )
        with respx.mock() as router:
            router.post(chatgpt_auth.TOKEN_URL).mock(
                return_value=fakes.token_response(access_token="fresh")
            )
            route = router.post(chatgpt_inference.RESPONSES_URL).mock(
                return_value=stream_response(sse(completed("ok")))
            )
            await chatgpt_inference.chatgpt_acompletion(
                "m", messages=[{"role": "user", "content": "hi"}]
            )
        assert route.calls.last.request.headers["authorization"] == "Bearer fresh"


class TestStream:
    async def test_deltas_are_used_when_the_completed_event_has_no_text(
        self, responses_api: respx.Route
    ) -> None:
        responses_api.mock(
            return_value=stream_response(
                sse(
                    delta('{"a"'),
                    delta(": 1}"),
                    {"type": "response.completed", "response": {"output": []}},
                    done=True,
                )
            )
        )
        result = await chatgpt_inference.chatgpt_acompletion(
            "m", messages=[{"role": "user", "content": "hi"}]
        )
        assert result.choices[0].message.content == '{"a": 1}'

    async def test_a_stream_without_completion_is_a_failure(
        self, responses_api: respx.Route
    ) -> None:
        responses_api.mock(return_value=stream_response(sse(delta("partial"))))
        with pytest.raises(chatgpt_inference.ChatGPTPlanError) as raised:
            await chatgpt_inference.chatgpt_acompletion(
                "m", messages=[{"role": "user", "content": "hi"}]
            )
        assert raised.value.code == "stream_ended_without_completion"

    @pytest.mark.parametrize(
        ("event", "code"),
        [
            (
                {
                    "type": "response.failed",
                    "response": {
                        "error": {"code": "subscription_sharing_usage_limit_exceeded"}
                    },
                },
                "subscription_sharing_usage_limit_exceeded",
            ),
            ({"type": "response.incomplete", "response": {}}, "response_incomplete"),
            ({"type": "error", "code": "server_error"}, "server_error"),
        ],
    )
    async def test_failure_events_raise_with_their_code(
        self, responses_api: respx.Route, event: dict, code: str
    ) -> None:
        responses_api.mock(return_value=stream_response(sse(delta("x"), event)))
        with pytest.raises(chatgpt_inference.ChatGPTPlanError) as raised:
            await chatgpt_inference.chatgpt_acompletion(
                "m", messages=[{"role": "user", "content": "hi"}]
            )
        assert raised.value.code == code

    async def test_a_rejected_request_keeps_its_error_code(
        self, responses_api: respx.Route
    ) -> None:
        responses_api.mock(
            return_value=httpx.Response(
                403,
                json={
                    "error": {
                        "code": "subscription_sharing_user_not_eligible",
                        "message": "not eligible",
                    }
                },
            )
        )
        with pytest.raises(chatgpt_inference.ChatGPTPlanError) as raised:
            await chatgpt_inference.chatgpt_acompletion(
                "m", messages=[{"role": "user", "content": "hi"}]
            )
        assert raised.value.code == "subscription_sharing_user_not_eligible"
        assert raised.value.status_code == 403
        assert "plan-access-token" not in str(raised.value)


class TestModels:
    async def test_lists_only_visible_models_in_server_order(self) -> None:
        with respx.mock() as router:
            route = router.get(chatgpt_inference.MODELS_URL).mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "models": [
                            {
                                "slug": "b-model",
                                "display_name": "B",
                                "visibility": "list",
                            },
                            {
                                "slug": "hidden",
                                "display_name": "H",
                                "visibility": "hide",
                            },
                            {"slug": "a-model", "visibility": "list"},
                        ]
                    },
                )
            )
            models = await chatgpt_inference.list_models()
        assert models == [
            {"slug": "b-model", "display_name": "B"},
            {"slug": "a-model", "display_name": "a-model"},
        ]
        assert route.calls.last.request.headers["authorization"] == (
            "Bearer plan-access-token"
        )
