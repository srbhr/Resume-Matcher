"""LiteLLM wrapper for multi-provider AI support."""

import json
import logging
import os
import re
from typing import Any

import litellm
from pydantic import BaseModel

from app.config import settings

# LLM timeout configuration (seconds)
LLM_TIMEOUT_HEALTH_CHECK = 30
LLM_TIMEOUT_COMPLETION = 120
LLM_TIMEOUT_JSON = 180  # JSON completions may take longer


class LLMConfig(BaseModel):
    """LLM configuration model."""

    provider: str
    model: str
    api_key: str
    api_base: str | None = None


def get_llm_config() -> LLMConfig:
    """Get current LLM configuration from settings."""
    return LLMConfig(
        provider=settings.llm_provider,
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        api_base=settings.llm_api_base,
    )


def get_model_name(config: LLMConfig) -> str:
    """Convert provider/model to LiteLLM format."""
    provider_prefixes = {
        "openai": "",  # OpenAI models don't need prefix
        "anthropic": "anthropic/",
        "openrouter": "openrouter/",
        "gemini": "gemini/",
        "deepseek": "deepseek/",
        "ollama": "ollama/",
    }

    prefix = provider_prefixes.get(config.provider, "")

    # Don't add prefix if model already starts with a known provider prefix
    known_prefixes = ["openrouter/", "anthropic/", "gemini/", "deepseek/", "ollama/"]
    if any(config.model.startswith(p) for p in known_prefixes):
        return config.model

    # Add provider prefix for models that need it
    return f"{prefix}{config.model}" if prefix else config.model


def setup_llm_environment(config: LLMConfig) -> None:
    """Set up environment variables for LiteLLM."""
    env_map = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
    }

    # Set the appropriate API key environment variable
    if config.provider in env_map and config.api_key:
        os.environ[env_map[config.provider]] = config.api_key

    # For Ollama, set the base URL
    if config.provider == "ollama" and config.api_base:
        os.environ["OLLAMA_API_BASE"] = config.api_base


async def check_llm_health(config: LLMConfig | None = None) -> dict[str, Any]:
    """Check if the LLM provider is accessible and working."""
    if config is None:
        config = get_llm_config()

    # Check if API key is configured (except for Ollama)
    if config.provider != "ollama" and not config.api_key:
        return {
            "healthy": False,
            "provider": config.provider,
            "model": config.model,
            "error": "API key not configured",
        }

    setup_llm_environment(config)
    model_name = get_model_name(config)

    try:
        # Make a minimal test call with timeout
        response = await litellm.acompletion(
            model=model_name,
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=5,
            api_base=config.api_base,
            timeout=LLM_TIMEOUT_HEALTH_CHECK,
        )

        return {
            "healthy": True,
            "provider": config.provider,
            "model": config.model,
            "response_model": response.model if response else None,
        }
    except Exception as e:
        return {
            "healthy": False,
            "provider": config.provider,
            "model": config.model,
            "error": str(e),
        }


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

    setup_llm_environment(config)
    model_name = get_model_name(config)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    response = await litellm.acompletion(
        model=model_name,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        api_base=config.api_base,
        timeout=LLM_TIMEOUT_COMPLETION,
    )

    return response.choices[0].message.content


def _supports_json_mode(provider: str, model: str) -> bool:
    """Check if the model supports JSON mode."""
    # Models that support response_format={"type": "json_object"}
    json_mode_providers = ["openai", "anthropic", "gemini", "deepseek"]
    if provider in json_mode_providers:
        return True
    # OpenRouter models - check if underlying model supports it
    if provider == "openrouter":
        # Most major models on OpenRouter support JSON mode
        json_capable = ["claude", "gpt-4", "gpt-3.5", "gemini", "mistral"]
        return any(cap in model.lower() for cap in json_capable)
    return False


def _extract_json(content: str) -> str:
    """Extract JSON from LLM response, handling various formats."""
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

        if end_idx != -1:
            return content[: end_idx + 1]

    # Try to find JSON object in the content
    start_idx = content.find("{")
    if start_idx != -1:
        # Recursively extract from the found position
        return _extract_json(content[start_idx:])

    # Check if content looks like JSON properties without braces
    if re.match(r'^\s*"[a-zA-Z]', content):
        # Wrap in braces
        content = "{" + content
        # Find a reasonable end point
        if not content.rstrip().endswith("}"):
            content = content.rstrip().rstrip(",") + "}"
        return content

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

    setup_llm_environment(config)
    model_name = get_model_name(config)

    # Build messages
    json_system = (system_prompt or "") + "\n\nYou must respond with valid JSON only. No explanations, no markdown."
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
            kwargs: dict[str, Any] = {
                "model": model_name,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.1 if attempt == 0 else 0.0,  # Lower temp on retry
                "api_base": config.api_base,
                "timeout": LLM_TIMEOUT_JSON,
            }

            # Add JSON mode if supported
            if use_json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            response = await litellm.acompletion(**kwargs)
            content = response.choices[0].message.content

            if not content:
                raise ValueError("Empty response from LLM")

            logging.debug(f"LLM response (attempt {attempt + 1}): {content[:300]}")

            # Extract and parse JSON
            json_str = _extract_json(content)
            return json.loads(json_str)

        except json.JSONDecodeError as e:
            last_error = e
            logging.warning(f"JSON parse failed (attempt {attempt + 1}): {e}")
            if attempt < retries:
                # Add hint to prompt for retry
                messages[-1]["content"] = prompt + "\n\nIMPORTANT: Output ONLY a valid JSON object. Start with { and end with }."
                continue
            raise ValueError(f"Failed to parse JSON after {retries + 1} attempts: {e}")

        except Exception as e:
            last_error = e
            logging.warning(f"LLM call failed (attempt {attempt + 1}): {e}")
            if attempt < retries:
                continue
            raise

    raise ValueError(f"Failed after {retries + 1} attempts: {last_error}")
