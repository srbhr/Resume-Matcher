"""LiteLLM wrapper for multi-provider AI support."""

import json
import logging
import re
import threading
from typing import Any, Literal

import litellm
from litellm import Router
from litellm.router import RetryPolicy
from pydantic import BaseModel

from app.config import load_config_file, save_config_file, settings

LITELLM_LOGGER_NAMES = ("LiteLLM", "LiteLLM Router", "LiteLLM Proxy")


def _configure_litellm_logging() -> None:
    """Align LiteLLM logger levels with application settings."""
    numeric_level = getattr(logging, settings.log_llm, logging.WARNING)
    for logger_name in LITELLM_LOGGER_NAMES:
        logging.getLogger(logger_name).setLevel(numeric_level)


_configure_litellm_logging()

# Let LiteLLM drop provider-unsupported params (reasoning_effort, non-default
# temperature, etc.) instead of raising UnsupportedParamsError. This replaces
# the hardcoded per-model compatibility branches this module used to carry.
litellm.drop_params = True

# Let LiteLLM auto-drop `thinking_blocks` from assistant messages when required
# for a given turn (e.g., tool-call turns missing the blocks). Defensive; no
# current code path sends thinking, but future-proofs the Router.
litellm.modify_params = True

# LLM timeout configuration (seconds) - base values
LLM_TIMEOUT_HEALTH_CHECK = 30
LLM_TIMEOUT_COMPLETION = 120
LLM_TIMEOUT_JSON = 180  # JSON completions may take longer

# JSON-010: JSON extraction safety limits
MAX_JSON_EXTRACTION_RECURSION = 10
MAX_JSON_CONTENT_SIZE = 1024 * 1024  # 1MB

# Default token budget for structured JSON completions (e.g. resume parsing).
# Chosen to accommodate large resumes while staying within most providers'
# output limits. Callers should use get_safe_max_tokens() so this is
# automatically clamped to the model's actual capacity.
DEFAULT_JSON_MAX_TOKENS = 8192


class LLMConfig(BaseModel):
    """LLM configuration model."""

    provider: str
    model: str
    api_key: str
    api_base: str | None = None
    reasoning_effort: Literal["minimal", "low", "medium", "high"] | None = None


def _normalize_api_base(provider: str, api_base: str | None) -> str | None:
    """Normalize api_base for LiteLLM provider-specific expectations.

    When using proxies/aggregators, users often paste a base URL that already
    includes a version segment (e.g., `/v1`). Some LiteLLM provider handlers
    append those segments internally, which can lead to duplicated paths like
    `/v1/v1/...` and cause 404s.

    For the `openai` provider, LiteLLM uses the upstream OpenAI client which
    handles `/v1` correctly — we MUST preserve whatever the user pasted so
    that OpenAI-compatible endpoints like llama.cpp (http://localhost:8080/v1)
    round-trip intact. See issue #751.
    """
    if not api_base:
        return None

    base = api_base.strip()
    if not base:
        return None

    base = base.rstrip("/")

    # OpenAI / OpenAI-compatible: preserve the URL as-is. The OpenAI client
    # resolves paths correctly whether the base includes /v1 or not.
    if provider in ("openai", "openai_compatible"):
        return base or None

    # Anthropic handler appends '/v1/messages'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/messages'.
    if provider == "anthropic" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # Gemini handler appends '/v1/models/...'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/models/...'.
    if provider == "gemini" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # OpenRouter base is https://openrouter.ai/api/v1. LiteLLM appends /v1
    # internally, so strip it to avoid /v1/v1.
    if provider == "openrouter" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # Ollama doesn't use /v1 paths. Strip common suffixes users might paste:
    # /v1, /api/chat, /api/generate
    if provider == "ollama":
        for suffix in ("/v1", "/api/chat", "/api/generate", "/api"):
            if base.endswith(suffix):
                base = base[: -len(suffix)].rstrip("/")
                break

    return base or None


# Sentinel passed to the OpenAI client when the user leaves api_key blank for
# openai_compatible. The client validates non-empty strings but not the value
# format; local servers that don't check auth ignore it.
_OPENAI_COMPATIBLE_SENTINEL = "sk-no-key"


def _effective_api_key(provider: str, api_key: str) -> str:
    """Return the api_key to pass to LiteLLM.

    For openai_compatible with a blank key, substitute a sentinel so the
    OpenAI client accepts the call. Other providers pass through unchanged.
    """
    if provider == "openai_compatible" and not api_key:
        return _OPENAI_COMPATIBLE_SENTINEL
    return api_key


def _extract_text_parts(value: Any, depth: int = 0, max_depth: int = 10) -> list[str]:
    """Recursively extract text segments from nested response structures.

    Handles strings, lists, dicts with 'text'/'content'/'value' keys, and objects
    with text/content attributes. Limits recursion depth to avoid cycles.

    Args:
        value: Input value that may contain text in strings, lists, dicts, or objects.
        depth: Current recursion depth.
        max_depth: Maximum recursion depth before returning no content.

    Returns:
        A list of extracted text segments.
    """
    if depth >= max_depth:
        return []

    if value is None:
        return []

    if isinstance(value, str):
        return [value]

    if isinstance(value, list):
        parts: list[str] = []
        next_depth = depth + 1
        for item in value:
            parts.extend(_extract_text_parts(item, next_depth, max_depth))
        return parts

    if isinstance(value, dict):
        next_depth = depth + 1
        if "text" in value:
            return _extract_text_parts(value.get("text"), next_depth, max_depth)
        if "content" in value:
            return _extract_text_parts(value.get("content"), next_depth, max_depth)
        if "value" in value:
            return _extract_text_parts(value.get("value"), next_depth, max_depth)
        return []

    next_depth = depth + 1
    if hasattr(value, "text"):
        return _extract_text_parts(getattr(value, "text"), next_depth, max_depth)
    if hasattr(value, "content"):
        return _extract_text_parts(getattr(value, "content"), next_depth, max_depth)

    return []


def _join_text_parts(parts: list[str]) -> str | None:
    """Join text parts with newlines, filtering empty strings.

    Args:
        parts: Candidate text segments.

    Returns:
        Joined string or None if the result is empty.
    """
    joined = "\n".join(part for part in parts if part).strip()
    return joined or None


def _extract_message_text(message: Any) -> str | None:
    """Extract plain text from a LiteLLM message object across providers.

    Fallback order:
      1. message.content (standard OpenAI-compatible path)
      2. message.reasoning_content (DeepSeek R1, OpenAI o1/o3 via LiteLLM
         standardized field)
      3. message.thinking (Anthropic extended thinking)

    Reasoning-only responses are treated as valid content so thinking models
    can be used without special-casing them in every call site.
    """
    content: Any = None

    if hasattr(message, "content"):
        content = message.content
    elif isinstance(message, dict):
        content = message.get("content")

    text = _join_text_parts(_extract_text_parts(content))
    if text:
        return text

    # Fallback: reasoning_content (DeepSeek R1, OpenAI o1/o3).
    reasoning = _safe_get(message, "reasoning_content")
    text = _join_text_parts(_extract_text_parts(reasoning))
    if text:
        return text

    # Fallback: thinking (Anthropic extended thinking).
    thinking = _safe_get(message, "thinking")
    return _join_text_parts(_extract_text_parts(thinking))


def _safe_get(obj: Any, key: str) -> Any:
    """Get attribute or dict key from an object."""
    if hasattr(obj, key):
        return getattr(obj, key)
    if isinstance(obj, dict):
        return obj.get(key)
    return None


def _extract_choice_text(choice: Any) -> str | None:
    """Extract plain text from a LiteLLM choice object.

    Tries message.content first, then choice.text, then choice.delta. Handles both
    object attributes and dict keys.
    """
    content = _extract_message_text(_safe_get(choice, "message"))
    if content:
        return content

    for field in ("text", "delta"):
        value = _safe_get(choice, field)
        if value is not None:
            extracted = _join_text_parts(_extract_text_parts(value))
            if extracted:
                return extracted

    return None


def _to_code_block(content: str | None, language: str = "text") -> str:
    """Wrap content in a markdown code block for client display."""
    text = (content or "").strip()
    if not text:
        text = "<empty>"
    return f"```{language}\n{text}\n```"


# Regex for provider-style API-key tokens that may appear in upstream error
# messages (OpenAI / Anthropic / OpenRouter / DeepSeek all use ``sk-...``;
# Google AI Studio uses ``AIza...``). The OpenAI client already partially
# masks keys in its error text but leaves the first ~8 and last ~4 chars
# visible, which is enough to identify the provider and correlate with the
# user's stored key. We redact any remaining key-like run before we surface
# the message to the client via ``error_detail``.
_SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    # sk-<anything-non-whitespace>, covering both plain and already-masked
    # tokens (e.g., ``sk-ant-a****...7QAA``). Minimum length of 12 avoids
    # matching harmless substrings like ``sk-foo``.
    re.compile(r"sk-[A-Za-z0-9_\-*.]{12,}"),
    # Google AI Studio.
    re.compile(r"AIza[0-9A-Za-z_\-]{10,}"),
    # Generic Bearer tokens in an Authorization header line.
    re.compile(r"(?i)(Bearer\s+)[^\s\"']+"),
)


def _scrub_secrets(text: str) -> str:
    """Redact API-key-like substrings before the text leaves the server.

    Applied to ``error_detail`` on the failing-health-check path so that
    upstream exception messages (which may include partially-masked keys)
    can't be used by a Settings-page viewer to identify which provider /
    key variant is configured.
    """
    if not text:
        return text
    redacted = text
    for pattern in _SECRET_PATTERNS:
        redacted = pattern.sub("<redacted>", redacted)
    return redacted


_PROVIDER_KEY_MAP: dict[str, str] = {
    "openai": "openai",
    "openai_compatible": "openai_compatible",
    "anthropic": "anthropic",
    "gemini": "google",
    "openrouter": "openrouter",
    "deepseek": "deepseek",
    "groq": "groq",
    "ollama": "ollama",
}


# Providers where the user commonly runs a local server without auth. For
# these, we MUST NOT fall back to ``settings.llm_api_key`` (the env-level
# default), because the env var may hold a real paid-API key that would then
# leak to a local/compatible endpoint the user set up expecting no auth.
_PROVIDERS_WITHOUT_ENV_KEY_FALLBACK: frozenset[str] = frozenset(
    {"openai_compatible", "ollama"}
)


def resolve_api_key(stored: dict, provider: str) -> str:
    """Resolve the effective API key from stored config.

    Priority: top-level ``api_key`` > ``api_keys[provider]`` > env/settings
    default — EXCEPT for providers in ``_PROVIDERS_WITHOUT_ENV_KEY_FALLBACK``
    (``openai_compatible`` / ``ollama``), where the env-level default is
    skipped so a paid OpenAI key in ``LLM_API_KEY`` cannot leak to a local
    self-hosted server when the user leaves the provider key blank.

    This is the single source of truth for key resolution. Every code path
    that needs an API key (runtime, config display, health check, test
    endpoint) must call this function instead of reading ``stored["api_key"]``
    directly.
    """
    api_key = stored.get("api_key", "")
    if not api_key:
        api_keys = stored.get("api_keys", {})
        if not isinstance(api_keys, dict):
            api_keys = {}
        config_provider = _PROVIDER_KEY_MAP.get(provider, provider)
        env_default = (
            ""
            if provider in _PROVIDERS_WITHOUT_ENV_KEY_FALLBACK
            else settings.llm_api_key
        )
        api_key = api_keys.get(config_provider, env_default)
    return api_key


def get_llm_config() -> LLMConfig:
    """Get current LLM configuration.

    Priority for api_key: top-level api_key > api_keys[provider] > env/settings
    Priority for reasoning_effort: config.json > env/settings

    Runs a one-shot migration for existing gpt-5 users: if provider is openai,
    model contains 'gpt-5', and reasoning_effort is ABSENT from config.json
    (not merely empty), persist reasoning_effort='minimal' to preserve the
    behavior the removed hardcoded branch provided. Users who clear the
    field explicitly (empty string persisted by the PUT handler) will not
    have it restored.
    """
    stored = load_config_file()
    provider = stored.get("provider", settings.llm_provider)
    model = stored.get("model", settings.llm_model)

    # One-shot migration: preserve old gpt-5 reasoning_effort behavior for
    # existing configs. Gated on ABSENT key so users can opt out by clearing
    # the field (PUT handler persists an empty string on clear).
    if (
        provider == "openai"
        and "gpt-5" in model.lower()
        and "reasoning_effort" not in stored
    ):
        stored["reasoning_effort"] = "minimal"
        try:
            save_config_file(stored)
            logging.info(
                "Migrated gpt-5 config to preserve reasoning_effort=minimal "
                "(set REASONING_EFFORT= or clear in Settings to disable)"
            )
        except Exception as e:
            # Non-fatal — retry on next call.
            logging.warning("Failed to persist gpt-5 migration: %s", e)

    api_key = resolve_api_key(stored, provider)

    raw_re = stored.get("reasoning_effort", settings.reasoning_effort)
    # Normalize empty string to None — user explicitly cleared.
    reasoning_effort = raw_re if raw_re else None

    return LLMConfig(
        provider=provider,
        model=model,
        api_key=api_key,
        api_base=stored.get("api_base", settings.llm_api_base),
        reasoning_effort=reasoning_effort,
    )


def get_model_name(config: LLMConfig) -> str:
    """Convert provider/model to LiteLLM format.

    For most providers, adds the provider prefix if not already present.
    For OpenRouter, always adds 'openrouter/' prefix since OpenRouter models
    use nested prefixes like 'openrouter/anthropic/claude-3.5-sonnet'.
    """
    provider_prefixes = {
        "openai": "",  # OpenAI models don't need prefix
        # openai_compatible: route via LiteLLM's openai/ prefix so the OpenAI
        # client handles the request; works for llama.cpp, vLLM, LM Studio,
        # and any server exposing the OpenAI Chat Completions API shape.
        "openai_compatible": "openai/",
        "anthropic": "anthropic/",
        "openrouter": "openrouter/",
        "gemini": "gemini/",
        "deepseek": "deepseek/",
        "groq": "groq/",
        "ollama": "ollama_chat/",  # ollama_chat/ routes to /api/chat (supports messages array)
    }

    prefix = provider_prefixes.get(config.provider, "")

    # OpenRouter is special: always add openrouter/ prefix unless already present
    # OpenRouter models use nested format: openrouter/anthropic/claude-3.5-sonnet
    if config.provider == "openrouter":
        if config.model.startswith("openrouter/"):
            return config.model
        return f"openrouter/{config.model}"

    # For other providers, don't add prefix if model already has a known prefix
    known_prefixes = [
        "openrouter/",
        "anthropic/",
        "gemini/",
        "deepseek/",
        "groq/",
        "ollama/",
        "ollama_chat/",
        "openai/",
    ]
    if any(config.model.startswith(p) for p in known_prefixes):
        return config.model

    # Add provider prefix for models that need it
    return f"{prefix}{config.model}" if prefix else config.model


# ---------------------------------------------------------------------------
# Router — centralises transport retries, cooldowns, and error-type policies
# ---------------------------------------------------------------------------

_router: Router | None = None
_router_config_key: str = ""
_router_lock = threading.Lock()


def _config_fingerprint(config: LLMConfig) -> str:
    """Generate a fingerprint to detect config changes.

    Uses Python's built-in ``hash()`` on the API key — stable within a
    single process (which is the cache lifetime), collision-resistant,
    and not a cryptographic function so it won't trigger CodeQL alerts.
    The raw key is never stored in the fingerprint string.
    """
    key_hash = hash(config.api_key) if config.api_key else 0
    return f"{config.provider}|{config.model}|{key_hash}|{config.api_base}"


def _build_router(config: LLMConfig) -> Router:
    """Build a LiteLLM Router with error-type retry policies."""
    model_name = get_model_name(config)

    litellm_params: dict[str, Any] = {"model": model_name}
    effective_key = _effective_api_key(config.provider, config.api_key)
    if effective_key:
        litellm_params["api_key"] = effective_key
    api_base = _normalize_api_base(config.provider, config.api_base)
    if api_base:
        litellm_params["api_base"] = api_base

    return Router(
        model_list=[
            {
                "model_name": "primary",
                "litellm_params": litellm_params,
            }
        ],
        num_retries=3,
        retry_policy=RetryPolicy(
            AuthenticationErrorRetries=0,
            BadRequestErrorRetries=0,
            TimeoutErrorRetries=2,
            RateLimitErrorRetries=3,
            ContentPolicyViolationErrorRetries=0,
            InternalServerErrorRetries=2,
        ),
        # Cooldowns disabled: with a single deployment and no fallback,
        # cooldowns would blackout the backend on transient failures.
        # Re-enable when a fallback deployment is added.
        disable_cooldowns=True,
    )


def get_router(config: LLMConfig | None = None) -> tuple[Router, LLMConfig]:
    """Get or rebuild the LiteLLM Router.

    The Router is cached and only rebuilt when the underlying config changes.
    Returns the Router and the config it was built from.
    """
    global _router, _router_config_key

    if config is None:
        config = get_llm_config()

    key = _config_fingerprint(config)
    with _router_lock:
        if _router is None or _router_config_key != key:
            _router = _build_router(config)
            _router_config_key = key
            logging.info("LiteLLM Router rebuilt for %s/%s", config.provider, config.model)
        router = _router

    return router, config


async def check_llm_health(
    config: LLMConfig | None = None,
    *,
    include_details: bool = False,
    test_prompt: str | None = None,
) -> dict[str, Any]:
    """Check if the LLM provider is accessible and working."""
    if config is None:
        config = get_llm_config()

    # Check if API key is configured. Ollama and openai_compatible local
    # servers often run without auth, so a blank key is acceptable for those
    # providers — a sentinel is passed downstream (see _effective_api_key)
    # to satisfy the OpenAI client's non-empty-string validation.
    if config.provider not in ("ollama", "openai_compatible") and not config.api_key:
        return {
            "healthy": False,
            "provider": config.provider,
            "model": config.model,
            "error_code": "api_key_missing",
        }

    model_name = get_model_name(config)

    prompt = test_prompt or "Hi"

    try:
        # Make a minimal test call with timeout
        # Pass API key directly to avoid race conditions with global os.environ
        kwargs: dict[str, Any] = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 64,
            "api_key": _effective_api_key(config.provider, config.api_key),
            "api_base": _normalize_api_base(config.provider, config.api_base),
            "timeout": LLM_TIMEOUT_HEALTH_CHECK,
        }
        if config.reasoning_effort:
            kwargs["reasoning_effort"] = config.reasoning_effort

        response = await litellm.acompletion(**kwargs)
        content = _extract_choice_text(response.choices[0])
        if not content:
            # LLM-003: Empty response (even after reasoning_content / thinking
            # fallbacks in _extract_choice_text) marks health as unhealthy.
            logging.warning(
                "LLM health check returned empty content",
                extra={"provider": config.provider, "model": config.model},
            )
            result: dict[str, Any] = {
                "healthy": False,
                "provider": config.provider,
                "model": config.model,
                "response_model": response.model if response else None,
                "error_code": "empty_content",
                "message": "LLM returned empty response",
            }
            if include_details:
                result["test_prompt"] = _to_code_block(prompt)
                result["model_output"] = _to_code_block(None)
            return result

        result = {
            "healthy": True,
            "provider": config.provider,
            "model": config.model,
            "response_model": response.model if response else None,
        }
        if include_details:
            result["test_prompt"] = _to_code_block(prompt)
            result["model_output"] = _to_code_block(content)
            # Surface reasoning/thinking text separately ONLY when the model
            # also returned distinct primary content. If message.content was
            # empty, _extract_choice_text already folded the reasoning text
            # into `content` above — surfacing it here too would duplicate
            # identical text in "Model output" and "Model thinking".
            msg = response.choices[0].message
            primary_content = _join_text_parts(
                _extract_text_parts(_safe_get(msg, "content"))
            )
            reasoning_text = None
            if primary_content:
                reasoning_text = (
                    _join_text_parts(_extract_text_parts(_safe_get(msg, "reasoning_content")))
                    or _join_text_parts(_extract_text_parts(_safe_get(msg, "thinking")))
                )
            result["reasoning_content"] = (
                _to_code_block(reasoning_text) if reasoning_text else None
            )
        return result
    except Exception as e:
        # Log full exception details server-side, but do not expose them to clients
        logging.exception(
            "LLM health check failed",
            extra={"provider": config.provider, "model": config.model},
        )

        # Provide a minimal, actionable client-facing hint without leaking secrets.
        error_code = "health_check_failed"
        message = str(e)
        if "404" in message and "/v1/v1/" in message:
            error_code = "duplicate_v1_path"
        elif "404" in message:
            error_code = "not_found_404"
        elif "<!doctype html" in message.lower() or "<html" in message.lower():
            error_code = "html_response"
        result = {
            "healthy": False,
            "provider": config.provider,
            "model": config.model,
            "error_code": error_code,
        }
        if include_details:
            result["test_prompt"] = _to_code_block(prompt)
            result["model_output"] = _to_code_block(None)
            # Scrub api-key-like tokens before surfacing the upstream error
            # text so the Settings UI can't be used to read back even a
            # partially-masked copy of the configured key.
            result["error_detail"] = _to_code_block(_scrub_secrets(message))
        return result


async def complete(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
) -> str:
    """Make a completion request to the LLM.

    Transport retries (429, 500, timeout) are handled by the Router.
    """
    router, config = get_router(config)
    model_name = get_model_name(config)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    try:
        kwargs: dict[str, Any] = {
            "model": "primary",
            "messages": messages,
            "max_tokens": max_tokens,
            "timeout": _calculate_timeout("completion", max_tokens, config.provider),
        }
        if _supports_temperature(model_name, temperature):
            kwargs["temperature"] = temperature
        if config.reasoning_effort:
            kwargs["reasoning_effort"] = config.reasoning_effort

        response = await router.acompletion(**kwargs)

        content = _extract_choice_text(response.choices[0])
        if not content:
            raise ValueError("Empty response from LLM")
        # Strip thinking tags from reasoning models (deepseek-r1, qwq, etc.)
        if "<think>" in content:
            content = _strip_thinking_tags(content)
            if not content:
                raise ValueError("Response contained only thinking content, no output")
        return content
    except Exception as e:
        # Log the actual error server-side for debugging
        logging.error(f"LLM completion failed: {e}", extra={
                      "model": model_name})
        raise ValueError(
            "LLM completion failed. Please check your API configuration and try again."
        ) from e


def _supports_json_mode(model_name: str) -> bool:
    """Check if the model supports JSON mode via LiteLLM's model registry.

    Queries LiteLLM's model info for every provider (including openai,
    anthropic, etc.) so that capability is always determined from the
    registry rather than a hardcoded provider list.

    Ollama models support JSON mode natively (format="json") but are
    often not in LiteLLM's registry (custom/local models), so we
    always return True for ollama.

    Args:
        model_name: LiteLLM-formatted model name (from get_model_name).
    """
    # Ollama supports JSON mode natively via format="json" even when
    # models aren't in LiteLLM's registry (custom, quantized, etc.)
    if model_name.startswith(("ollama/", "ollama_chat/")):
        return True

    try:
        info = litellm.get_model_info(model=model_name)
        supported_params = info.get("supported_openai_params", [])
        return "response_format" in supported_params
    except Exception:
        # Model not in LiteLLM's registry — fall back to prompt-only JSON
        # mode (the system prompt already instructs "respond with valid JSON
        # only"). This avoids sending response_format to models that may
        # reject it.
        logging.debug("Model %s not in LiteLLM registry, skipping JSON mode", model_name)
        return False


FALLBACK_MAX_TOKENS = 4096

def get_safe_max_tokens(model_name: str, requested: int = DEFAULT_JSON_MAX_TOKENS) -> int:
    """Return a token count safe for the given model, clamped to its output limit.

    Queries LiteLLM's model registry for ``max_output_tokens`` and returns
    ``min(requested, model_limit)`` so callers never send a value that exceeds
    what the backend actually supports.

    If the model is not in the registry (e.g. custom Ollama models), it falls
    back to a safe conservative limit (FALLBACK_MAX_TOKENS).

    Args:
        model_name: LiteLLM-formatted model name (from get_model_name).
        requested: Desired token budget; defaults to DEFAULT_JSON_MAX_TOKENS.

    Returns:
        Safe token count, clamped correctly and always >= 1.
    """
    safe_requested = max(1, requested)

    try:
        info = litellm.get_model_info(model=model_name)
        model_limit = info.get("max_output_tokens") or info.get("max_tokens")
        if model_limit and isinstance(model_limit, int) and model_limit > 0:
            safe = min(safe_requested, model_limit)
            if safe < safe_requested:
                logging.debug(
                    "max_tokens clamped %d → %d for model %s (model limit)",
                    safe_requested,
                    safe,
                    model_name,
                )
            return safe
    except Exception:
        pass  # Model not in registry, drop down to fallback logic

    safe = min(safe_requested, FALLBACK_MAX_TOKENS)
    logging.debug(
        "Model %s not in LiteLLM registry, clamping requested max_tokens %d → %d constraint",
        model_name,
        safe_requested,
        safe,
    )
    return safe


def _appears_truncated(data: dict, schema_type: str = "resume") -> bool:
    """LLM-001: Check if JSON data appears to be truncated.

    Detects suspicious patterns indicating incomplete responses.
    The checks are schema-aware so that enrichment/diff/keyword outputs
    are not evaluated against resume-structure heuristics.

    Args:
        data: Parsed JSON dict.
        schema_type: Expected schema — "resume" (full resume), "enrichment"
            (analyze output), "diff" (diff changes), or "keywords".
            Determines which fields are checked for truncation.
    """
    if not isinstance(data, dict):
        return False

    if schema_type == "resume":
        # Full resume structure: check for empty required arrays
        suspicious_empty_arrays = ["workExperience", "education", "skills"]
        for key in suspicious_empty_arrays:
            if key in data and data[key] == []:
                # Log warning - these are rarely empty in real resumes
                logging.warning(
                    "Possible truncation detected: '%s' is empty",
                    key,
                )
                return True
        return False

    if schema_type == "enrichment":
        # Enrichment analyze returns items_to_enrich + questions.
        # Empty arrays are valid (resume is already strong).
        # Only flag if keys are entirely missing (LLM ignored structure).
        if "items_to_enrich" not in data or "questions" not in data:
            logging.warning(
                "Possible truncation detected: enrichment missing required keys"
            )
            return True
        return False

    # For "diff", "keywords", and unknown schemas: no truncation heuristics.
    # Diff may legitimately return empty changes; keywords may return empty
    # lists when the job description has no actionable terms.
    return False


def _supports_temperature(model_name: str, temperature: float | None = None) -> bool:
    """Check if the model supports the given temperature value.

    Uses LiteLLM model registry for capability detection, with
    provider-specific fallbacks for known restrictions:
      - Anthropic claude-opus-4.*: temperature is deprecated
      - Moonshot kimi-k2.6: only temperature=1 allowed

    Queries LiteLLM's model info for every provider so that capability is
    always determined from the registry rather than a hardcoded list.

    Args:
        model_name: LiteLLM-formatted model name (from get_model_name).
        temperature: The temperature value to check. If None, returns True
            (caller isn't setting a specific value).

    Returns:
        True if the model supports the given temperature, False otherwise.
    """
    if temperature is None:
        return True

    # Ollama models are often not in LiteLLM's registry (custom/local),
    # but they universally support temperature.
    if model_name.startswith(("ollama/", "ollama_chat/")):
        return True

    try:
        info = litellm.get_model_info(model=model_name)
        supported_params = info.get("supported_openai_params", [])
        if "temperature" not in supported_params:
            return False
    except Exception:
        # Model not in LiteLLM's registry — be conservative and skip
        # temperature to avoid BadRequestError from unsupported params.
        logging.debug(
            "Model %s not in LiteLLM registry, skipping temperature", model_name
        )
        return False

    # Provider-specific restrictions not captured by the registry.
    # Anthropic Opus 4.x deprecated temperature entirely.
    if "claude-opus-4" in model_name.lower():
        return False

    # Moonshot kimi-k2.6 only allows temperature=1.
    if "kimi-k2.6" in model_name.lower() and temperature != 1.0:
        return False

    return True


def _get_retry_temperature(model_name: str, attempt: int, base_temp: float = 0.1) -> float | None:
    """LLM-002: Get temperature for retry attempt.

    Returns None if the model does not support temperature at all.
    Returns 1.0 for models that only support temperature=1.
    Otherwise returns increasing temperatures for retry variation.
    """
    # Moonshot kimi-k2.6 only allows temperature=1.
    if "kimi-k2.6" in model_name.lower():
        return 1.0

    if not _supports_temperature(model_name, base_temp):
        return None

    temperatures = [base_temp, 0.3, 0.5, 0.7]
    return temperatures[min(attempt, len(temperatures) - 1)]


def _calculate_timeout(
    operation: str,
    max_tokens: int = 4096,
    provider: str = "openai",
) -> int:
    """LLM-005: Calculate adaptive timeout based on operation and parameters."""
    base_timeouts = {
        "health_check": LLM_TIMEOUT_HEALTH_CHECK,
        "completion": LLM_TIMEOUT_COMPLETION,
        "json": LLM_TIMEOUT_JSON,
    }

    base = base_timeouts.get(operation, LLM_TIMEOUT_COMPLETION)

    # Scale by token count (relative to 4096 baseline)
    token_factor = max(1.0, max_tokens / 4096)

    # Provider-specific latency adjustments
    provider_factors = {
        "openai": 1.0,
        "anthropic": 1.2,
        "openrouter": 1.5,  # More variable latency
        "groq": 1.0,
        "ollama": 2.0,  # Local models can be slower
    }
    provider_factor = provider_factors.get(provider, 1.0)

    return int(base * token_factor * provider_factor)


def _strip_thinking_tags(content: str) -> str:
    """Strip thinking/reasoning tags from model output.

    Ollama thinking models (deepseek-r1, qwq, etc.) wrap their reasoning
    in <think>...</think> tags. The actual answer follows after the closing
    tag. Strip these so JSON extraction finds the real output.
    """
    # Remove <think>...</think> blocks (including multiline)
    stripped = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    # Also handle unclosed <think> tag (model may still be "thinking" at end)
    stripped = re.sub(r"<think>.*", "", stripped, flags=re.DOTALL)
    return stripped.strip()


def _extract_json(content: str, _depth: int = 0) -> str:
    """Extract JSON from LLM response, handling various formats.

    LLM-001: Improved to detect and reject likely truncated JSON.
    LLM-007: Improved error messages for debugging.
    JSON-010: Added recursion depth and size limits.
    """
    # JSON-010: Safety limits
    if _depth > MAX_JSON_EXTRACTION_RECURSION:
        raise ValueError(
            f"JSON extraction exceeded max recursion depth: {_depth}")
    if len(content) > MAX_JSON_CONTENT_SIZE:
        raise ValueError(
            f"Content too large for JSON extraction: {len(content)} bytes")

    original = content

    # Strip thinking model tags (deepseek-r1, qwq, etc.)
    if "<think>" in content:
        content = _strip_thinking_tags(content)

    # Remove markdown code blocks
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        parts = content.split("```")
        if len(parts) >= 2:
            content = parts[1]
            # Remove language identifier if present (e.g., "json\n{...")
            if content.startswith(("json", "JSON")):
                content = content[4:]

    content = content.strip()

    # If content starts with {, find the matching }
    if content.startswith("{"):
        depth = 0
        end_idx = -1
        in_string = False
        escape_next = False

        for i, char in enumerate(content):
            if escape_next:
                escape_next = False
                continue
            if char == "\\":
                escape_next = True
                continue
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end_idx = i
                    break

        # LLM-001: Check for unbalanced braces - loop ended without depth reaching 0
        if end_idx == -1 and depth != 0:
            logging.warning(
                "JSON extraction found unbalanced braces (depth=%d), possible truncation",
                depth,
            )

        if end_idx != -1:
            return content[: end_idx + 1]

    # Try to find JSON object in the content (only if not already at start)
    start_idx = content.find("{")
    if start_idx > 0:
        # Only recurse if { is found after position 0 to avoid infinite recursion
        return _extract_json(content[start_idx:], _depth + 1)

    # LLM-007: Log unrecognized format for debugging
    logging.error(
        "Could not extract JSON from response format. Content preview: %s",
        content[:200] if content else "<empty>",
    )
    raise ValueError(f"No JSON found in response: {original[:200]}")


async def complete_json(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
    retries: int = 2,
    schema_type: str = "resume",
) -> dict[str, Any]:
    """Make a completion request expecting JSON response.

    Uses JSON mode when available, with app-level retries for content-quality
    issues (malformed JSON, truncation).  Transport retries (429, 500, timeout)
    are handled by the Router and are NOT retried again here.

    Args:
        schema_type: Expected schema — "resume", "enrichment", "diff", or
            "keywords". Passed to _appears_truncated for context-aware truncation
            detection and used to tailor retry hints.
    """
    router, config = get_router(config)
    model_name = get_model_name(config)

    # Build messages
    json_system = (
        system_prompt or ""
    ) + "\n\nYou must respond with valid JSON only. No explanations, no markdown."
    messages = [
        {"role": "system", "content": json_system},
        {"role": "user", "content": prompt},
    ]

    # Check if we can use JSON mode
    use_json_mode = _supports_json_mode(model_name)
    json_mode_failed = False

    for attempt in range(retries + 1):
        try:
            kwargs: dict[str, Any] = {
                "model": "primary",
                "messages": messages,
                "max_tokens": max_tokens,
                "timeout": _calculate_timeout("json", max_tokens, config.provider),
            }
            # LLM-002: Increase temperature on retry for variation
            retry_temp = _get_retry_temperature(model_name, attempt)
            if retry_temp is not None:
                kwargs["temperature"] = retry_temp
            if config.reasoning_effort:
                kwargs["reasoning_effort"] = config.reasoning_effort

            # JSON-012: Fallback to prompt-only JSON mode after JSON-mode failure.
            # LiteLLM registry may report support for models that the upstream
            # aggregator (OpenRouter) cannot actually serve with response_format.
            if use_json_mode and not json_mode_failed:
                kwargs["response_format"] = {"type": "json_object"}

            response = await router.acompletion(**kwargs)
            content = _extract_choice_text(response.choices[0])

            if not content:
                raise ValueError("Empty response from LLM")

            logging.debug(
                f"LLM response (attempt {attempt + 1}): {content[:300]}")

            # Extract and parse JSON
            json_str = _extract_json(content)
            result = json.loads(json_str)

            # LLM-001: Check if parsed result appears truncated
            if isinstance(result, dict) and _appears_truncated(result, schema_type):
                if attempt < retries:
                    logging.warning(
                        "Parsed JSON appears truncated (attempt %d/%d), retrying",
                        attempt + 1,
                        retries + 1,
                    )
                    if schema_type == "resume":
                        hint = (
                            "\n\nIMPORTANT: Output the COMPLETE JSON object with ALL sections. Do not truncate."
                        )
                    elif schema_type == "enrichment":
                        hint = (
                            "\n\nIMPORTANT: Output the COMPLETE JSON object with ALL keys: items_to_enrich, questions, analysis_summary. Do not truncate."
                        )
                    else:
                        hint = (
                            "\n\nIMPORTANT: Output ONLY a valid JSON object. Start with { and end with }."
                        )
                    messages[-1]["content"] = prompt + hint
                    continue
                logging.warning(
                    "Parsed JSON appears truncated on final attempt, proceeding with result"
                )

            return result

        except json.JSONDecodeError as e:
            # Content quality — malformed JSON, retry with prompt hint
            logging.warning(f"JSON parse failed (attempt {attempt + 1}): {e}")
            if use_json_mode and not json_mode_failed:
                # JSON-012: Registry claimed JSON mode support but the upstream
                # failed to return valid JSON. Disable JSON mode for retries.
                json_mode_failed = True
                logging.warning(
                    "JSON mode failed for %s, falling back to prompt-only (attempt %d)",
                    model_name, attempt + 1,
                )
            if attempt < retries:
                messages[-1]["content"] = (
                    prompt
                    + "\n\nIMPORTANT: Output ONLY a valid JSON object. Start with { and end with }."
                )
                continue
            raise ValueError(
                f"Failed to parse JSON after {retries + 1} attempts: {e}")

        except ValueError as e:
            # Content quality — empty response, JSON extraction failure
            logging.warning(f"Content extraction failed (attempt {attempt + 1}): {e}")
            if attempt < retries:
                continue
            raise

        except Exception:
            # Transport errors — Router already retried with backoff.
            # Cooldowns are disabled (see _build_router); no additional
            # retry is attempted here.
            raise

    raise ValueError(f"Failed after {retries + 1} attempts")
