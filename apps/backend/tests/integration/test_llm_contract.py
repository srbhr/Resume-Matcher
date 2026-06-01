"""Transport-level contract tests for app.llm.

These exercise the REAL request path in app/llm.py (``complete`` /
``complete_json`` / ``check_llm_health``) instead of mocking
``router.acompletion``. We stand up a fake HTTP server with ``respx`` and let
litellm's real client issue the request over the wire, so we finally have
regression coverage for the long-standing "Ollama doesn't work" reports and the
local ``openai_compatible`` server path (issue #751).

EVERY test in this module is a TRUE respx HTTP test: litellm's client actually
serialises a request, sends it through httpx's transport, and parses the mocked
HTTP response. No ``router.acompletion`` / ``litellm.acompletion`` boundary
mocks are used.

Why the autouse ``_litellm_httpx_transport`` fixture exists: litellm 1.86
defaults to an aiohttp-based transport (``LiteLLMAiohttpTransport``) for its
HTTP handler. respx hooks httpx's ``AsyncHTTPTransport``, so aiohttp requests
sail straight past it to the real network. Setting
``litellm.disable_aiohttp_transport = True`` forces litellm back onto httpx,
which respx can intercept. We also flush litellm's in-memory client cache so a
client built under the aiohttp transport in an earlier test can't be reused.
"""

import httpx
import pytest
import respx

from app.llm import LLMConfig, check_llm_health, complete, complete_json


@pytest.fixture(autouse=True)
def _reset_router(monkeypatch):
    """Reset the module-global Router cache between tests.

    ``get_router`` caches ``_router`` / ``_router_config_key`` globally, so
    without this an explicit config from one test would bleed into the next.
    """
    import app.llm as llm

    monkeypatch.setattr(llm, "_router", None)
    monkeypatch.setattr(llm, "_router_config_key", "")


@pytest.fixture(autouse=True)
def _litellm_httpx_transport(monkeypatch):
    """Force litellm onto httpx so respx can intercept the request.

    See the module docstring for the aiohttp-vs-httpx rationale. ``monkeypatch``
    restores the original flag after the test; the client-cache flush is a
    harmless one-way reset.
    """
    import litellm

    monkeypatch.setattr(litellm, "disable_aiohttp_transport", True, raising=False)
    try:
        litellm.in_memory_llm_clients_cache.flush_cache()
    except Exception:  # noqa: BLE001 - cache is best-effort; never fail setup on it
        pass


# ---------------------------------------------------------------------------
# Response-body builders mirroring each provider's wire format
# ---------------------------------------------------------------------------


def _openai_chat_completion(content, model="llama-3.1-8b"):
    """An OpenAI Chat Completions response body (openai / openai_compatible)."""
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 1700000000,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
    }


def _ollama_chat_response(content, model="llama3"):
    """An Ollama /api/chat (non-streaming) response body."""
    return {
        "model": model,
        "created_at": "2024-01-01T00:00:00Z",
        "message": {"role": "assistant", "content": content},
        "done": True,
        "done_reason": "stop",
    }


def _ollama_show_response():
    """A minimal Ollama /api/show response.

    litellm's ollama_chat path probes ``{default_host}/api/show`` to learn the
    model's capabilities before the real completion. We stub it so the probe
    doesn't reach a real daemon.
    """
    return {
        "license": "",
        "modelfile": "",
        "parameters": "",
        "template": "",
        "details": {"family": "llama", "parameter_size": "8B"},
        "model_info": {},
        "capabilities": ["completion"],
    }


# ---------------------------------------------------------------------------
# openai_compatible (llama.cpp / vLLM / LM Studio) — TRUE respx HTTP
# ---------------------------------------------------------------------------


class TestOpenAICompatibleTransport:
    """complete() against a fake OpenAI-compatible server over real HTTP."""

    @respx.mock
    async def test_complete_happy_path_roundtrips_v1_base(self):
        """A /v1 base URL round-trips intact and content flows back.

        Regression guard for issue #751: the OpenAI client must hit
        ``{api_base}/chat/completions`` with the pasted ``/v1`` preserved
        exactly once (no ``/v1/v1`` duplication, no stripped ``/v1``).
        """
        route = respx.post(
            "http://local-llm.test/v1/chat/completions"
        ).mock(return_value=httpx.Response(200, json=_openai_chat_completion("hello world")))

        cfg = LLMConfig(
            provider="openai_compatible",
            model="llama-3.1-8b",
            api_key="",
            api_base="http://local-llm.test/v1",
        )
        out = await complete("Hello", config=cfg)

        assert out == "hello world"
        assert route.called
        # The normalized URL must be the pasted /v1 base + /chat/completions.
        assert str(route.calls.last.request.url) == (
            "http://local-llm.test/v1/chat/completions"
        )

    @respx.mock
    async def test_complete_strips_thinking_tags_over_the_wire(self):
        """<think>...</think> reasoning is stripped from the transport output.

        deepseek-r1 / qwq style models emit reasoning wrapped in <think> tags
        before the real answer; complete() must return only the answer.
        """
        respx.post("http://local-llm.test/v1/chat/completions").mock(
            return_value=httpx.Response(
                200, json=_openai_chat_completion("<think>reasoning here</think>actual answer")
            )
        )

        cfg = LLMConfig(
            provider="openai_compatible",
            model="deepseek-r1",
            api_key="",
            api_base="http://local-llm.test/v1",
        )
        out = await complete("Hello", config=cfg)

        assert out == "actual answer"

    @respx.mock
    async def test_complete_json_parses_fenced_json_over_the_wire(self):
        """complete_json runs the real _extract_json on transport output.

        The model returns JSON wrapped in a ```json code fence (a common LLM
        habit). complete_json must strip the fence and return the parsed dict.
        """
        fenced = '```json\n{"required_skills": ["Python"], "keywords": ["fastapi"]}\n```'
        route = respx.post("http://local-llm.test/v1/chat/completions").mock(
            return_value=httpx.Response(200, json=_openai_chat_completion(fenced))
        )

        cfg = LLMConfig(
            provider="openai_compatible",
            model="llama-3.1-8b",
            api_key="",
            api_base="http://local-llm.test/v1",
        )
        out = await complete_json("Extract keywords", config=cfg, schema_type="keywords")

        assert out == {"required_skills": ["Python"], "keywords": ["fastapi"]}
        assert route.called


# ---------------------------------------------------------------------------
# ollama — TRUE respx HTTP
# ---------------------------------------------------------------------------


class TestOllamaTransport:
    """complete() against a fake Ollama daemon over real HTTP.

    litellm's ollama_chat path issues TWO requests: a capability probe to
    ``{default_host}/api/show`` (always localhost:11434), then the real
    completion to ``{configured_api_base}/api/chat``. Both are mocked.
    """

    @respx.mock
    async def test_complete_happy_path(self):
        """Ollama returns content via /api/chat and complete() surfaces it."""
        # Capability probe litellm fires before the completion (localhost host).
        respx.post("http://localhost:11434/api/show").mock(
            return_value=httpx.Response(200, json=_ollama_show_response())
        )
        chat_route = respx.post("http://ollama.test:11434/api/chat").mock(
            return_value=httpx.Response(200, json=_ollama_chat_response("ollama says hi"))
        )

        cfg = LLMConfig(
            provider="ollama",
            model="llama3",
            api_key="",
            api_base="http://ollama.test:11434",
        )
        out = await complete("Hello", config=cfg)

        assert out == "ollama says hi"
        assert chat_route.called
        # The completion must target the user-configured host's /api/chat,
        # not the localhost default used only for the capability probe.
        assert str(chat_route.calls.last.request.url) == (
            "http://ollama.test:11434/api/chat"
        )

    @respx.mock
    async def test_complete_json_over_the_wire(self):
        """complete_json works against Ollama's /api/chat wire format."""
        respx.post("http://localhost:11434/api/show").mock(
            return_value=httpx.Response(200, json=_ollama_show_response())
        )
        body = '{"required_skills": ["Go"], "keywords": ["k8s"]}'
        chat_route = respx.post("http://ollama.test:11434/api/chat").mock(
            return_value=httpx.Response(200, json=_ollama_chat_response(body))
        )

        cfg = LLMConfig(
            provider="ollama",
            model="llama3",
            api_key="",
            api_base="http://ollama.test:11434",
        )
        out = await complete_json("Extract", config=cfg, schema_type="keywords")

        assert out == {"required_skills": ["Go"], "keywords": ["k8s"]}
        assert chat_route.called


# ---------------------------------------------------------------------------
# check_llm_health — TRUE respx HTTP (calls litellm.acompletion directly)
# ---------------------------------------------------------------------------


class TestCheckHealthTransport:
    """check_llm_health over real HTTP (bypasses the Router, hits litellm)."""

    @respx.mock
    async def test_health_success(self):
        """A 200 with content marks the provider healthy."""
        route = respx.post("http://local-llm.test/v1/chat/completions").mock(
            return_value=httpx.Response(200, json=_openai_chat_completion("pong"))
        )

        cfg = LLMConfig(
            provider="openai_compatible",
            model="llama-3.1-8b",
            api_key="",
            api_base="http://local-llm.test/v1",
        )
        res = await check_llm_health(config=cfg)

        assert res["healthy"] is True
        assert res["provider"] == "openai_compatible"
        assert route.called

    @respx.mock
    async def test_health_empty_content_is_unhealthy(self):
        """A 200 with empty content is reported unhealthy (error_code set)."""
        respx.post("http://local-llm.test/v1/chat/completions").mock(
            return_value=httpx.Response(200, json=_openai_chat_completion(""))
        )

        cfg = LLMConfig(
            provider="openai_compatible",
            model="llama-3.1-8b",
            api_key="",
            api_base="http://local-llm.test/v1",
        )
        res = await check_llm_health(config=cfg)

        assert res["healthy"] is False
        assert res["error_code"] == "empty_content"

    @respx.mock
    async def test_health_failure_scrubs_api_key_from_error_detail(self):
        """A 401 yields healthy=False, an error_code, and a key-scrubbed detail.

        The fake provider echoes the configured ``sk-`` key in its error body
        (as the real OpenAI API does). With ``include_details=True`` the
        upstream message is surfaced as ``error_detail`` — but every ``sk-``
        token MUST be redacted so a Settings-page viewer can't read the key
        back out.
        """
        leaking_key = "sk-abcd1234efgh5678ijkl9012"
        respx.post("http://api.openai.test/v1/chat/completions").mock(
            return_value=httpx.Response(
                401,
                json={
                    "error": {
                        "message": (
                            f"Incorrect API key provided: {leaking_key}. "
                            "You can find your API key at ..."
                        ),
                        "type": "invalid_request_error",
                        "code": "invalid_api_key",
                    }
                },
            )
        )

        cfg = LLMConfig(
            provider="openai",
            model="gpt-4",
            api_key=leaking_key,
            api_base="http://api.openai.test/v1",
        )
        res = await check_llm_health(config=cfg, include_details=True)

        assert res["healthy"] is False
        assert res["error_code"]  # some non-empty failure code is set
        # The raw key must never reach the client, even partially.
        detail = res.get("error_detail") or ""
        assert leaking_key not in detail
        assert "sk-abcd1234" not in detail
        assert "<redacted>" in detail
