"""LiteLLM wrapper for multi-provider AI support."""

import json
import logging
import re
from typing import Any

import litellm
from pydantic import BaseModel

from app.config import settings

# LLM timeout configuration (seconds) - base values
LLM_TIMEOUT_HEALTH_CHECK = 30
LLM_TIMEOUT_COMPLETION = 120
LLM_TIMEOUT_JSON = 180  # JSON completions may take longer

# LLM-004: OpenRouter JSON-capable models (explicit allowlist)
OPENROUTER_JSON_CAPABLE_MODELS = {
    # Anthropic models
    "anthropic/claude-3-opus",
    "anthropic/claude-3-sonnet",
    "anthropic/claude-3-haiku",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3.5-haiku",
    "anthropic/claude-haiku-4-5-20251001",
    "anthropic/claude-sonnet-4-20250514",
    "anthropic/claude-opus-4-20250514",
    # OpenAI models
    "openai/gpt-4-turbo",
    "openai/gpt-4",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "openai/gpt-3.5-turbo",
    "openai/gpt-5-nano-2025-08-07",
    # Google models
    "google/gemini-pro",
    "google/gemini-1.5-pro",
    "google/gemini-1.5-flash",
    "google/gemini-2.0-flash",
    "google/gemini-3-flash-preview",
    # DeepSeek models
    "deepseek/deepseek-chat",
    "deepseek/deepseek-v3",
    "deepseek/deepseek-v3.2",
    # Mistral models
    "mistralai/mistral-large",
    "mistralai/mistral-medium",
}

# JSON-010: JSON extraction safety limits
MAX_JSON_EXTRACTION_RECURSION = 10
MAX_JSON_CONTENT_SIZE = 1024 * 1024  # 1MB


class LLMConfig(BaseModel):
    """LLM configuration model."""

    provider: str
    model: str
    api_key: str
    api_base: str | None = None


def _normalize_api_base(provider: str, api_base: str | None) -> str | None:
    """Normalize api_base for LiteLLM provider-specific expectations.

    When using proxies/aggregators, users often paste a base URL that already
    includes a version segment (e.g., `/v1`). Some LiteLLM provider handlers
    append those segments internally, which can lead to duplicated paths like
    `/v1/v1/...` and cause 404s.
    """
    if not api_base:
        return None

    base = api_base.strip()
    if not base:
        return None

    base = base.rstrip("/")

    # Anthropic handler appends '/v1/messages'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/messages'.
    if provider == "anthropic" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # Gemini handler appends '/v1/models/...'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/models/...'.
    if provider == "gemini" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    return base or None


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
    """Extract plain text from a LiteLLM message object across providers."""
    content: Any = None

    if hasattr(message, "content"):
        content = message.content
    elif isinstance(message, dict):
        content = message.get("content")

    return _join_text_parts(_extract_text_parts(content))


def _extract_choice_text(choice: Any) -> str | None:
    """Extract plain text from a LiteLLM choice object.

    Tries message.content first, then choice.text, then choice.delta. Handles both
    object attributes and dict keys.

    Args:
        choice: LiteLLM choice object or dict.

    Returns:
        Extracted text or None if no content is found.
    """
    message: Any = None
    if hasattr(choice, "message"):
        message = choice.message
    elif isinstance(choice, dict):
        message = choice.get("message")

    content = _extract_message_text(message)
    if content:
        return content

    if hasattr(choice, "text"):
        content = _join_text_parts(_extract_text_parts(getattr(choice, "text")))
        if content:
            return content
    if isinstance(choice, dict) and "text" in choice:
        content = _join_text_parts(_extract_text_parts(choice.get("text")))
        if content:
            return content

    if hasattr(choice, "delta"):
        content = _join_text_parts(_extract_text_parts(getattr(choice, "delta")))
        if content:
            return content
    if isinstance(choice, dict) and "delta" in choice:
        content = _join_text_parts(_extract_text_parts(choice.get("delta")))
        if content:
            return content

    return None


def _to_code_block(content: str | None, language: str = "text") -> str:
    """Wrap content in a markdown code block for client display."""
    text = (content or "").strip()
    if not text:
        text = "<empty>"
    return f"```{language}\n{text}\n```"


def _load_stored_config() -> dict:
    """Load config from config.json file."""
    config_path = settings.config_path
    if config_path.exists():
        try:
            return json.loads(config_path.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def get_llm_config() -> LLMConfig:
    """Get current LLM configuration.

    Priority: config.json file > environment variables/settings
    """
    stored = _load_stored_config()

    return LLMConfig(
        provider=stored.get("provider", settings.llm_provider),
        model=stored.get("model", settings.llm_model),
        api_key=stored.get("api_key", settings.llm_api_key),
        api_base=stored.get("api_base", settings.llm_api_base),
    )


def get_model_name(config: LLMConfig) -> str:
    """Convert provider/model to LiteLLM format.

    For most providers, adds the provider prefix if not already present.
    For OpenRouter, always adds 'openrouter/' prefix since OpenRouter models
    use nested prefixes like 'openrouter/anthropic/claude-3.5-sonnet'.
    """
    provider_prefixes = {
        "openai": "",  # OpenAI models don't need prefix
        "anthropic": "anthropic/",
        "openrouter": "openrouter/",
        "gemini": "gemini/",
        "deepseek": "deepseek/",
        "ollama": "ollama/",
    }

    prefix = provider_prefixes.get(config.provider, "")

    # OpenRouter is special: always add openrouter/ prefix unless already present
    # OpenRouter models use nested format: openrouter/anthropic/claude-3.5-sonnet
    if config.provider == "openrouter":
        if config.model.startswith("openrouter/"):
            return config.model
        return f"openrouter/{config.model}"

    # For other providers, don't add prefix if model already has a known prefix
    known_prefixes = ["openrouter/", "anthropic/", "gemini/", "deepseek/", "ollama/"]
    if any(config.model.startswith(p) for p in known_prefixes):
        return config.model

    # Add provider prefix for models that need it
    return f"{prefix}{config.model}" if prefix else config.model


def _supports_temperature(provider: str, model: str) -> bool:
    """Return whether passing `temperature` is supported for this model/provider combo.

    Some models (e.g., OpenAI gpt-5 family) reject temperature values other than 1,
    and LiteLLM may error when temperature is passed.
    """
    _ = provider
    model_lower = model.lower()
    if "gpt-5" in model_lower:
        return False
    return True


def _get_reasoning_effort(provider: str, model: str) -> str | None:
    """Return a default reasoning_effort for models that require it.

    Some OpenAI reasoning models (o1, o3, gpt-5) require a supported
    `reasoning_effort` (low, medium, high) to work correctly.
    """
    _ = provider
    model_lower = model.lower()
    # Handle GPT-5 (future-proofing) and o-series (o1, o3)
    if any(m in model_lower for m in ["gpt-5", "o1", "o3"]):
        return "medium"
    return None


async def check_llm_health(
    config: LLMConfig | None = None,
    *,
    include_details: bool = False,
    test_prompt: str | None = None,
) -> dict[str, Any]:
    """Check if the LLM provider is accessible and working."""
    if config is None:
        config = get_llm_config()

    # Check if API key is configured (except for Ollama)
    if config.provider != "ollama" and not config.api_key:
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
            "max_tokens": 16,
            "api_key": config.api_key,
            "api_base": _normalize_api_base(config.provider, config.api_base),
            "timeout": LLM_TIMEOUT_HEALTH_CHECK,
        }
        reasoning_effort = _get_reasoning_effort(config.provider, model_name)
        if reasoning_effort:
            kwargs["reasoning_effort"] = reasoning_effort

        response = await litellm.acompletion(**kwargs)
        content = _extract_choice_text(response.choices[0])
        if not content:
            # LLM-003: Empty response should mark health check as unhealthy
            logging.warning(
                "LLM health check returned empty content",
                extra={"provider": config.provider, "model": config.model},
            )
            result: dict[str, Any] = {
                "healthy": False,  # Fixed: empty content means unhealthy
                "provider": config.provider,
                "model": config.model,
                "response_model": response.model if response else None,
                "error_code": "empty_content",  # Changed from warning_code
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
            result["error_detail"] = _to_code_block(message)
        return result


async def complete(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
) -> str:
    """Make a completion request to the LLM."""
    if config is None:
        config = get_llm_config()

    model_name = get_model_name(config)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    try:
        # Pass API key directly to avoid race conditions with global os.environ
        kwargs: dict[str, Any] = {
            "model": model_name,
            "messages": messages,
            "max_tokens": max_tokens,
            "api_key": config.api_key,
            "api_base": _normalize_api_base(config.provider, config.api_base),
            "timeout": LLM_TIMEOUT_COMPLETION,
        }
        if _supports_temperature(config.provider, model_name):
            kwargs["temperature"] = temperature
        reasoning_effort = _get_reasoning_effort(config.provider, model_name)
        if reasoning_effort:
            kwargs["reasoning_effort"] = reasoning_effort

        response = await litellm.acompletion(**kwargs)

        content = _extract_choice_text(response.choices[0])
        if not content:
            raise ValueError("Empty response from LLM")
        return content
    except Exception as e:
        # Log the actual error server-side for debugging
        logging.error(f"LLM completion failed: {e}", extra={"model": model_name})
        raise ValueError(
            "LLM completion failed. Please check your API configuration and try again."
        ) from e


def _supports_json_mode(provider: str, model: str) -> bool:
    """Check if the model supports JSON mode."""
    # Models that support response_format={"type": "json_object"}
    json_mode_providers = ["openai", "anthropic", "gemini", "deepseek"]
    if provider in json_mode_providers:
        return True
    # LLM-004: OpenRouter models - use explicit allowlist instead of substring matching
    if provider == "openrouter":
        return model in OPENROUTER_JSON_CAPABLE_MODELS
    return False


def _appears_truncated(data: dict) -> bool:
    """LLM-001: Check if JSON data appears to be truncated.

    Detects suspicious patterns indicating incomplete responses.
    """
    if not isinstance(data, dict):
        return False

    # Check for empty arrays that should typically have content
    suspicious_empty_arrays = ["workExperience", "education", "skills"]
    for key in suspicious_empty_arrays:
        if key in data and data[key] == []:
            # Log warning - these are rarely empty in real resumes
            logging.warning(
                "Possible truncation detected: '%s' is empty",
                key,
            )
            return True

    # Check for missing critical sections
    required_top_level = ["personalInfo"]
    for key in required_top_level:
        if key not in data:
            logging.warning(
                "Possible truncation detected: missing required section '%s'",
                key,
            )
            return True

    return False


def _get_retry_temperature(attempt: int, base_temp: float = 0.1) -> float:
    """LLM-002: Get temperature for retry attempt - increases with each retry.

    Higher temperature on retries gives the model more variation to produce
    different (hopefully valid) output.
    """
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
        "ollama": 2.0,  # Local models can be slower
    }
    provider_factor = provider_factors.get(provider, 1.0)

    return int(base * token_factor * provider_factor)


def _extract_json(content: str, _depth: int = 0) -> str:
    """Extract JSON from LLM response, handling various formats.

    LLM-001: Improved to detect and reject likely truncated JSON.
    LLM-007: Improved error messages for debugging.
    JSON-010: Added recursion depth and size limits.
    """
    # JSON-010: Safety limits
    if _depth > MAX_JSON_EXTRACTION_RECURSION:
        raise ValueError(f"JSON extraction exceeded max recursion depth: {_depth}")
    if len(content) > MAX_JSON_CONTENT_SIZE:
        raise ValueError(f"Content too large for JSON extraction: {len(content)} bytes")

    original = content

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
) -> dict[str, Any]:
    """Make a completion request expecting JSON response.

    Uses JSON mode when available, with retry logic for reliability.
    """
    if config is None:
        config = get_llm_config()

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
    use_json_mode = _supports_json_mode(config.provider, config.model)

    last_error = None
    for attempt in range(retries + 1):
        try:
            # Build request kwargs
            # Pass API key directly to avoid race conditions with global os.environ
            kwargs: dict[str, Any] = {
                "model": model_name,
                "messages": messages,
                "max_tokens": max_tokens,
                "api_key": config.api_key,
                "api_base": _normalize_api_base(config.provider, config.api_base),
                "timeout": _calculate_timeout("json", max_tokens, config.provider),
            }
            if _supports_temperature(config.provider, model_name):
                # LLM-002: Increase temperature on retry for variation
                kwargs["temperature"] = _get_retry_temperature(attempt)
            reasoning_effort = _get_reasoning_effort(config.provider, model_name)
            if reasoning_effort:
                kwargs["reasoning_effort"] = reasoning_effort

            # Add JSON mode if supported
            if use_json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            response = await litellm.acompletion(**kwargs)
            content = _extract_choice_text(response.choices[0])

            if not content:
                raise ValueError("Empty response from LLM")

            logging.debug(f"LLM response (attempt {attempt + 1}): {content[:300]}")

            # Extract and parse JSON
            json_str = _extract_json(content)
            result = json.loads(json_str)

            # LLM-001: Check if parsed result appears truncated
            if isinstance(result, dict) and _appears_truncated(result):
                logging.warning(
                    "Parsed JSON appears truncated, but proceeding with result"
                )

            return result

        except json.JSONDecodeError as e:
            last_error = e
            logging.warning(f"JSON parse failed (attempt {attempt + 1}): {e}")
            if attempt < retries:
                # Add hint to prompt for retry
                messages[-1]["content"] = (
                    prompt
                    + "\n\nIMPORTANT: Output ONLY a valid JSON object. Start with { and end with }."
                )
                continue
            raise ValueError(f"Failed to parse JSON after {retries + 1} attempts: {e}")

        except Exception as e:
            last_error = e
            logging.warning(f"LLM call failed (attempt {attempt + 1}): {e}")
            if attempt < retries:
                continue
            raise

    raise ValueError(f"Failed after {retries + 1} attempts: {last_error}")
