"""LLM provider names are case- and whitespace-insensitive.

``LLM_PROVIDER=Anthropic`` used to fail the ``Literal[...]`` check on
``Settings.llm_provider`` and stop the app at startup, while a capitalised
provider in config.json or the API silently matched no provider prefix.
"""

import json

import pytest
from pydantic import ValidationError

import app.config as config_module
from app.config import Settings
from app.llm import LLMConfig, get_llm_config
from app.schemas.models import LLMConfigRequest

PROVIDER_SPELLINGS = [
    ("Anthropic", "anthropic"),
    ("  OPENAI ", "openai"),
    ("Claude_CLI", "claude_cli"),
    ("ChatGPT", "chatgpt"),
    ("Openai_Compatible", "openai_compatible"),
]


@pytest.mark.parametrize(("raw", "expected"), PROVIDER_SPELLINGS)
def test_settings_accepts_provider_in_any_case(raw: str, expected: str) -> None:
    assert Settings(llm_provider=raw).llm_provider == expected


def test_llm_provider_env_var_in_any_case(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "Anthropic")

    assert Settings(_env_file=None).llm_provider == "anthropic"


def test_unknown_provider_is_still_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(llm_provider="Nonsense")


def test_env_key_fallback_follows_a_capitalised_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.config import _get_llm_api_key_with_fallback

    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "Gemini")
    monkeypatch.setattr(
        config_module, "get_api_keys_from_config", lambda: {"google": "g-key"}
    )

    assert _get_llm_api_key_with_fallback() == "g-key"


def test_config_json_provider_is_normalised() -> None:
    path = config_module.get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"provider": " Anthropic ", "model": "claude-haiku-4-5-20251001"})
    )

    assert get_llm_config().provider == "anthropic"


@pytest.mark.parametrize(("raw", "expected"), PROVIDER_SPELLINGS)
def test_api_request_and_llm_config_normalise_the_provider(
    raw: str, expected: str
) -> None:
    assert LLMConfigRequest(provider=raw).provider == expected
    assert LLMConfig(provider=raw, model="m", api_key="k").provider == expected


def test_api_request_without_a_provider_stays_unset() -> None:
    assert LLMConfigRequest().provider is None
