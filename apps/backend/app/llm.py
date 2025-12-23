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


async def complete_json(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
) -> dict[str, Any]:
    """Make a completion request expecting JSON response."""
    if config is None:
        config = get_llm_config()

    setup_llm_environment(config)
    model_name = get_model_name(config)

    # Add JSON instruction to system prompt
    json_system = (system_prompt or "") + "\n\nRespond with valid JSON only."

    messages = [
        {"role": "system", "content": json_system},
        {"role": "user", "content": prompt},
    ]

    response = await litellm.acompletion(
        model=model_name,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.3,  # Lower temperature for structured output
        api_base=config.api_base,
        timeout=LLM_TIMEOUT_JSON,
    )

    content = response.choices[0].message.content

    if not content:
        raise ValueError("Empty response from LLM")

    # Debug: log raw response (first 500 chars)
    logging.debug(f"LLM raw response: {content[:500]}")

    # Extract JSON from response (handle markdown code blocks)
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        parts = content.split("```")
        if len(parts) >= 2:
            content = parts[1]

    content = content.strip()

    # Check if content looks like JSON properties without outer braces
    # Pattern: starts with optional whitespace then a quoted key
    looks_like_json_properties = bool(re.match(r'^\s*"[a-zA-Z]', content))

    if looks_like_json_properties and not content.startswith("{"):
        # LLM returned JSON without outer braces - wrap it
        logging.debug("Wrapping braceless JSON response")
        # Find the last property's closing brace/bracket
        content = "{" + content
        if not content.rstrip().endswith("}"):
            content = content.rstrip().rstrip(",") + "}"
    elif not content.startswith("{"):
        # Try to find a JSON object starting with {
        start_idx = content.find("{")
        if start_idx == -1:
            raise ValueError(f"No JSON object found in response: {content[:300]}")
        content = content[start_idx:]

    # Ensure content ends with }
    if not content.rstrip().endswith("}"):
        # Find the last } and truncate there
        end_idx = content.rfind("}")
        if end_idx == -1:
            content = content.rstrip().rstrip(",") + "}"
        else:
            content = content[: end_idx + 1]

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        # Log the problematic content for debugging
        logging.warning(f"JSON parse failed. Raw content: {content[:1000]}")
        raise ValueError(f"Invalid JSON: {e}. First 300 chars: {content[:300]}")
