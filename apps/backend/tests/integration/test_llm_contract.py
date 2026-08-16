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
        # A provider auth failure (401) falls through to the generic failure
        # code — assert the specific value, not just "truthy", so a silent
        # rename of the code is caught.
        assert res["error_code"] == "health_check_failed"
        # The raw key must never reach the client, even partially.
        detail = res.get("error_detail") or ""
        assert leaking_key not in detail
        assert "sk-abcd1234" not in detail
        assert "<redacted>" in detail


class TestAzureFoundryTransport:
    """Wire-level coverage for the azure_foundry provider (T-05).

    The Azure tests added with the provider were pure string-mapping assertions
    -- they asserted the code does what the code does. Both B-03 (the
    ``gpt5_series/`` prefix silently degrading every capability lookup) and H-03
    (api_version and api_base derived from disagreeing predicates, producing a
    doubled ``/openai/v1/openai/v1/`` path) survived them. These assert the URL
    litellm actually puts on the wire.
    """

    @respx.mock
    async def test_foundry_openai_endpoint_hits_single_v1_path(self):
        """The service root + api_version=v1 must not double the /openai/v1 segment."""
        route = respx.post(
            "https://example.services.ai.azure.com/openai/v1/chat/completions"
        ).mock(
            return_value=httpx.Response(
                200, json=_openai_chat_completion("azure says hi", model="gpt-5-mini")
            )
        )

        cfg = LLMConfig(
            provider="azure_foundry",
            model="gpt-5-mini",
            api_key="azure-key",
            api_base="https://example.services.ai.azure.com/openai/v1/responses",
        )
        out = await complete("Hello", config=cfg)

        assert out == "azure says hi"
        assert route.called
        url = str(route.calls.last.request.url)
        # H-03: exactly one /openai/v1 segment.
        assert url.count("/openai/v1") == 1, url

    async def test_model_name_stays_in_the_litellm_registry(self):
        """B-03: the routed model string must resolve capabilities correctly.

        With the old ``azure/gpt5_series/`` prefix this fell out of
        ``litellm.get_model_info``, silently clamping max_tokens to the 4096
        default and disabling JSON mode -- so long resumes came back truncated.
        """
        from app.llm import _supports_json_mode, get_model_name, get_safe_max_tokens

        cfg = LLMConfig(
            provider="azure_foundry",
            model="gpt-5-mini",
            api_key="azure-key",
            api_base="https://example.services.ai.azure.com/openai/v1/responses",
        )
        model_name = get_model_name(cfg)

        assert model_name == "azure/gpt-5-mini"
        assert "gpt5_series" not in model_name
        assert _supports_json_mode(model_name) is True
        assert get_safe_max_tokens(model_name) > 4096

    async def test_api_version_is_not_leaked_to_other_providers(self):
        """M-01: an explicit api_version must not escape the azure_foundry branch."""
        from app.llm import _azure_foundry_api_version

        leaked = LLMConfig(
            provider="ollama",
            model="gemma3:4b",
            api_key="",
            api_base="http://localhost:11434",
            api_version="2024-10-21",
        )
        assert _azure_foundry_api_version(leaked) is None

    async def test_plain_azure_openai_host_gets_no_v1_api_version(self):
        """H-03: a non-Foundry Azure host must not claim api_version=v1.

        _normalize_api_base leaves this URL untouched (the host check fails), so
        reporting v1 would make litellm build /openai/v1/openai/v1/ and 404.
        """
        from app.llm import _azure_foundry_api_version, _normalize_api_base

        cfg = LLMConfig(
            provider="azure_foundry",
            model="gpt-4o",
            api_key="azure-key",
            api_base="https://my-resource.openai.azure.com/openai/v1",
        )
        assert _azure_foundry_api_version(cfg) is None
        assert (
            _normalize_api_base(cfg.provider, cfg.api_base, cfg.model)
            == "https://my-resource.openai.azure.com/openai/v1"
        )

    async def test_malformed_port_does_not_raise(self):
        """`urlsplit().port` raises for a non-numeric or out-of-range port.

        _normalize_api_base runs inside _build_router and check_llm_health, so
        an unhandled raise here crashes before any LLM error handling. A bad
        endpoint must fail as a provider connection error instead.
        """
        from app.llm import _normalize_api_base

        for bad in (
            "https://example.services.ai.azure.com:99999/openai/v1",
            "https://example.services.ai.azure.com:abc/openai/v1",
        ):
            out = _normalize_api_base("azure_foundry", bad, "gpt-5-mini")
            # Rebuilt from the parsed hostname with the bad port dropped. It
            # must NOT return the raw input: that path preserved userinfo and
            # reintroduced the credential leak this rebuild exists to prevent.
            assert out == "https://example.services.ai.azure.com"

    async def test_malformed_port_does_not_leak_credentials(self):
        """The malformed-port fallback must still strip userinfo."""
        from app.llm import _normalize_api_base

        out = _normalize_api_base(
            "azure_foundry",
            "https://user:secret@example.services.ai.azure.com:99999/openai/v1",
            "gpt-5-mini",
        )
        assert "secret" not in (out or "")
        assert out == "https://example.services.ai.azure.com"

    async def test_explicit_port_is_preserved(self):
        from app.llm import _normalize_api_base

        out = _normalize_api_base(
            "azure_foundry",
            "https://example.services.ai.azure.com:8443/openai/v1/responses",
            "gpt-5-mini",
        )
        assert out == "https://example.services.ai.azure.com:8443"

    async def test_userinfo_is_stripped_from_normalized_base(self):
        """L-02: credentials pasted into the URL must not be carried forward."""
        from app.llm import _normalize_api_base

        out = _normalize_api_base(
            "azure_foundry",
            "https://user:secret@example.services.ai.azure.com/openai/v1/responses",
            "gpt-5-mini",
        )
        assert out == "https://example.services.ai.azure.com"
        assert "secret" not in (out or "")
