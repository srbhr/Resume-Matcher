"""Application configuration using pydantic-settings."""

import json
from pathlib import Path
from typing import Any, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Path to config file for API key persistence
CONFIG_FILE_PATH = Path(__file__).parent.parent / "data" / "config.json"
ALLOWED_LOG_LEVELS = ("CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG")


def _read_config_json() -> dict[str, Any]:
    """Raw read of config.json (no key injection)."""
    if CONFIG_FILE_PATH.exists():
        try:
            return json.loads(CONFIG_FILE_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _write_config_json(config: dict[str, Any]) -> None:
    """Raw write of config.json (no secret stripping)."""
    CONFIG_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE_PATH.write_text(json.dumps(config, indent=2))


def load_config_file() -> dict[str, Any]:
    """Load non-secret configuration, with decrypted API keys injected.

    API keys live in the encrypted SQLite store, not config.json. They are
    injected here under ``api_keys`` so ``resolve_api_key(stored, provider)``
    keeps resolving per-provider keys everywhere ``stored`` is built from this
    function. ``save_config_file`` strips them again, so they never round-trip
    back to disk.
    """
    config = _read_config_json()
    config["api_keys"] = get_api_keys_from_config()
    return config


def save_config_file(config: dict[str, Any]) -> None:
    """Save non-secret configuration to config.json.

    Secrets (``api_keys`` map and the legacy single ``api_key``) are stripped
    before writing — they belong to the encrypted store only.
    """
    config = dict(config)
    config.pop("api_keys", None)
    config.pop("api_key", None)
    _write_config_json(config)


def get_api_keys_from_config() -> dict[str, str]:
    """Get decrypted API keys from the encrypted SQLite store.

    Returns:
        Dictionary with key-store provider names as keys and plaintext keys as
        values (entries that fail to decrypt are omitted).
    """
    from app.crypto import decrypt
    from app.database import db

    decrypted: dict[str, str] = {}
    for provider, ciphertext in db.get_api_key_ciphertexts().items():
        plaintext = decrypt(ciphertext)
        if plaintext:
            decrypted[provider] = plaintext
    return decrypted


def save_api_keys_to_config(api_keys: dict[str, str]) -> None:
    """Replace the encrypted key store with ``api_keys`` (encrypting each).

    Replace-all semantics mirror the legacy ``config["api_keys"] = api_keys``;
    the config router reads-merges-saves the full map.
    """
    from app.crypto import encrypt
    from app.database import db

    # Encrypt everything first, then swap in a single transaction, so a partial
    # failure (encryption error or DB write) can never wipe previously stored
    # keys mid-replace.
    ciphertexts = {provider: encrypt(key) for provider, key in api_keys.items() if key}
    db.replace_api_keys(ciphertexts)


def delete_api_key_from_config(provider: str) -> None:
    """Delete a specific API key from the encrypted store."""
    from app.database import db

    db.delete_api_key(provider)


def clear_all_api_keys() -> None:
    """Clear all API keys from the encrypted store and any legacy config slots."""
    from app.database import db

    db.clear_api_keys()
    # Defensively clear any legacy plaintext remnants from config.json.
    config = _read_config_json()
    if "api_keys" in config or "api_key" in config:
        config.pop("api_keys", None)
        config.pop("api_key", None)
        _write_config_json(config)


def migrate_legacy_keys() -> None:
    """Fold legacy plaintext keys from config.json into the encrypted store.

    Idempotent and non-clobbering: an existing config.json ``api_keys`` map and
    the legacy single ``api_key`` (mapped to its key-store provider via the
    active provider) are written to the encrypted store **only if that provider
    slot is empty**, then removed from config.json. This eliminates the
    legacy-shadow bug where ``resolve_api_key`` returned one shared key for
    every provider.
    """
    config = _read_config_json()
    legacy_map = config.get("api_keys")
    legacy_single = config.get("api_key")
    if not legacy_map and not legacy_single:
        return

    from app.crypto import encrypt
    from app.database import db

    existing = set(db.get_api_key_ciphertexts().keys())

    if isinstance(legacy_map, dict):
        for provider, key in legacy_map.items():
            if key and provider not in existing:
                db.set_api_key_ciphertext(provider, encrypt(key))
                existing.add(provider)

    if legacy_single:
        # Map the active LLM provider to its key-store provider name.
        provider = config.get("provider") or settings.llm_provider
        key_provider = _LEGACY_PROVIDER_KEY_MAP.get(provider, provider)
        if key_provider not in existing:
            db.set_api_key_ciphertext(key_provider, encrypt(legacy_single))

    # Strip the legacy slots from config.json now that they're in the store.
    config.pop("api_keys", None)
    config.pop("api_key", None)
    _write_config_json(config)


# Mirror of llm._PROVIDER_KEY_MAP, duplicated to avoid importing llm.py (which
# pulls in litellm) at config import time.
_LEGACY_PROVIDER_KEY_MAP: dict[str, str] = {
    "openai": "openai",
    "openai_compatible": "openai_compatible",
    "anthropic": "anthropic",
    "gemini": "google",
    "openrouter": "openrouter",
    "deepseek": "deepseek",
    "groq": "groq",
    "ollama": "ollama",
}


def _get_llm_api_key_with_fallback() -> str:
    """Get LLM API key with fallback to config file.

    Priority: Environment variable > config.json > empty string
    """
    import os

    # First check environment variable
    env_key = os.environ.get("LLM_API_KEY", "")
    if env_key:
        return env_key

    # Fallback to config file based on provider
    config_keys = get_api_keys_from_config()
    provider = os.environ.get("LLM_PROVIDER", "openai")

    # Map provider to config key
    provider_map = {
        "openai": "openai",
        "anthropic": "anthropic",
        "gemini": "google",
        "openrouter": "openrouter",
        "deepseek": "deepseek",
        "groq": "groq",
        "ollama": "ollama",
    }

    config_provider = provider_map.get(provider, provider)
    return config_keys.get(config_provider, "")


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM Configuration
    llm_provider: Literal[
        "openai",
        "openai_compatible",
        "anthropic",
        "openrouter",
        "gemini",
        "deepseek",
        "groq",
        "ollama",
    ] = "openai"
    llm_model: str = "gpt-5-nano-2025-08-07"
    llm_api_key: str = ""
    llm_api_base: str | None = None  # For Ollama or custom endpoints
    log_llm: Literal["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"] = "WARNING"

    @field_validator("llm_provider", mode="before")
    @classmethod
    def set_default_provider(cls, v: Any) -> str:
        """Handle empty string provider by defaulting to openai."""
        if not v or (isinstance(v, str) and not v.strip()):
            return "openai"
        return v

    @field_validator("log_llm", mode="before")
    @classmethod
    def normalize_log_llm_level(cls, v: Any) -> str:
        """Normalize LiteLLM log level from environment values."""
        value = "WARNING" if not v else str(v).strip().upper()
        if value not in ALLOWED_LOG_LEVELS:
            raise ValueError(f"Invalid LOG_LLM: {value}. Allowed: {ALLOWED_LOG_LEVELS}")
        return value

    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = False
    log_level: Literal["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"] = "INFO"
    frontend_base_url: str = "http://localhost:3000"

    # Hard timeout (seconds) for a single resume tailoring/improve request — the
    # backend wraps the improve flow in asyncio.wait_for(timeout=this). It MUST be
    # kept in sync with the two frontend layers (Next.js `proxyTimeout` and the
    # client AbortController, both driven by NEXT_PUBLIC_REQUEST_TIMEOUT_MS):
    # whichever layer is shortest aborts first, so raising only one silently fails
    # (this is why issue #776's backend-only workaround didn't work). Local LLMs
    # (Ollama, llama.cpp, …) often need longer than the 240s default; bounded to
    # [30, 1800]s so a stuck request can't hold a worker indefinitely.
    request_timeout_seconds: int = 240

    @field_validator("request_timeout_seconds", mode="before")
    @classmethod
    def clamp_request_timeout(cls, v: Any) -> int:
        """Clamp to [30, 1800] seconds; fall back to 240 on blank/invalid input."""
        if v is None or (isinstance(v, str) and not v.strip()):
            return 240
        try:
            seconds = int(float(str(v).strip()))
        except (TypeError, ValueError, OverflowError):
            # OverflowError guards against inf (int(float("inf"))); ValueError
            # against nan/garbage. A bad env value must never crash startup.
            return 240
        return max(30, min(1800, seconds))

    # Reasoning effort for models that support it (OpenAI gpt-5 family,
    # Anthropic Claude 3.7+, DeepSeek R1, etc.). None means "do not send the
    # param" — the default for maximum compatibility. LiteLLM drops this
    # parameter for providers that don't support it (via drop_params=True).
    reasoning_effort: Literal["minimal", "low", "medium", "high"] | None = None

    @field_validator("reasoning_effort", mode="before")
    @classmethod
    def normalize_reasoning_effort(cls, v: Any) -> Any:
        """Treat empty string (common when env var is blank) as None."""
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("log_level", mode="before")
    @classmethod
    def normalize_log_level(cls, v: Any) -> str:
        """Normalize application log level from environment values."""
        value = "INFO" if not v else str(v).strip().upper()
        if value not in ALLOWED_LOG_LEVELS:
            raise ValueError(f"Invalid LOG_LEVEL: {value}. Allowed: {ALLOWED_LOG_LEVELS}")
        return value

    # CORS Configuration
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @property
    def effective_cors_origins(self) -> list[str]:
        """CORS origins including frontend_base_url for production deployments."""
        origins = list(self.cors_origins)
        url = self.frontend_base_url.strip().rstrip("/")
        if url and url not in origins:
            origins.append(url)
        return origins

    # Paths
    data_dir: Path = Path(__file__).parent.parent / "data"

    @property
    def db_path(self) -> Path:
        """Path to the legacy TinyDB database file (migration source only)."""
        return self.data_dir / "database.json"

    @property
    def sqlite_path(self) -> Path:
        """Path to the SQLite database file (primary data store)."""
        return self.data_dir / "resume_matcher.db"

    @property
    def config_path(self) -> Path:
        """Path to config storage file."""
        return self.data_dir / "config.json"

    def get_effective_api_key(self) -> str:
        """Get the effective API key with config file fallback.

        Priority: Environment/settings value > config.json > empty string
        """
        if self.llm_api_key:
            return self.llm_api_key
        return _get_llm_api_key_with_fallback()


settings = Settings()
