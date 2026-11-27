"""Application configuration using pydantic-settings."""

import json
import logging
import os
import stat
import tempfile
import threading
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.db_url import normalize_database_url, validate_schema_name
from app.host_guard import LOOPBACK_HOSTS

ALLOWED_LOG_LEVELS = ("CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG")
logger = logging.getLogger(__name__)
_CONFIG_WRITE_LOCK = threading.Lock()


def get_config_path() -> Path:
    """Return the canonical config path, honoring legacy monkeypatches.

    ``settings.config_path`` owns the runtime location. ``CONFIG_FILE_PATH`` is
    retained as a compatibility alias for existing callers that monkeypatch
    that name; only an explicit change from its import-time value wins over the
    Settings-owned path.
    """
    if CONFIG_FILE_PATH != _IMPORTED_CONFIG_FILE_PATH:
        return CONFIG_FILE_PATH
    return settings.config_path


def normalize_provider(value: Any) -> Any:
    """Strip and lowercase a provider name so ``Anthropic`` matches ``anthropic``.

    Non-strings pass through for the caller's own validation to reject.
    """
    return value.strip().lower() if isinstance(value, str) else value


def _read_config_json() -> dict[str, Any]:
    """Raw read of config.json (no key injection)."""
    config_path = get_config_path()
    if config_path.exists():
        try:
            config = json.loads(config_path.read_text())
        except (json.JSONDecodeError, OSError) as e:
            logger.error("Failed to load config: %s", e)
            return {}
        if isinstance(config, dict) and "provider" in config:
            config["provider"] = normalize_provider(config["provider"])
        return config
    return {}


def _write_config_json(config: dict[str, Any]) -> None:
    """Atomically replace config.json with one complete snapshot.

    Writes are serialized within the process. Callers provide complete
    snapshots, so concurrent in-process updates resolve in lock-acquisition
    order. Cross-process writers still install only complete snapshots because
    replacement is atomic. In both cases the last completed replacement wins;
    this primitive does not merge fields. Directory durability errors after
    replacement are logged: the snapshot is already installed, so callers must
    still acknowledge the save and invalidate cached reads.
    """
    serialized = json.dumps(config, indent=2)
    with _CONFIG_WRITE_LOCK:
        # Follow managed symlinks instead of replacing the link itself. Keep an
        # existing target's access mode; new configurations remain owner-only.
        config_path = get_config_path().resolve()
        config_path.parent.mkdir(parents=True, exist_ok=True)
        existing_mode = (
            stat.S_IMODE(config_path.stat().st_mode) if config_path.exists() else None
        )
        file_descriptor, temporary_name = tempfile.mkstemp(
            dir=config_path.parent,
            prefix=f".{config_path.name}.",
            suffix=".tmp",
        )
        temporary_path = Path(temporary_name)
        try:
            if existing_mode is not None:
                os.chmod(temporary_path, existing_mode)
            with os.fdopen(file_descriptor, "w", encoding="utf-8") as temporary_file:
                file_descriptor = -1
                temporary_file.write(serialized)
                temporary_file.flush()
                os.fsync(temporary_file.fileno())
            os.replace(temporary_path, config_path)
            if os.name != "nt":
                try:
                    directory_fd = os.open(
                        config_path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
                    )
                    try:
                        os.fsync(directory_fd)
                    finally:
                        os.close(directory_fd)
                except OSError:
                    logger.warning(
                        "Config snapshot replaced at %s, but directory durability "
                        "could not be confirmed",
                        config_path,
                        exc_info=True,
                    )
        finally:
            if file_descriptor >= 0:
                os.close(file_descriptor)
            temporary_path.unlink(missing_ok=True)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # Keeps DATABASE_URL credentials out of validation errors.
        hide_input_in_errors=True,
    )

    # LLM Configuration
    llm_provider: Literal[
        "openai",
        "openai_compatible",
        "azure_foundry",
        "anthropic",
        "openrouter",
        "gemini",
        "deepseek",
        "groq",
        "ollama",
        "claude_cli",
        "chatgpt",
        "agent",
    ] = "openai"
    llm_model: str = "gpt-6-luna"
    llm_api_key: str = ""
    llm_api_base: str | None = None  # For Ollama or custom endpoints
    log_llm: Literal["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"] = "WARNING"

    @field_validator("llm_provider", mode="before")
    @classmethod
    def set_default_provider(cls, v: Any) -> str:
        """Default an empty provider to openai and ignore case and padding."""
        if not v or (isinstance(v, str) and not v.strip()):
            return "openai"
        return normalize_provider(v)

    @field_validator("log_llm", mode="before")
    @classmethod
    def normalize_log_llm_level(cls, v: Any) -> str:
        """Normalize LiteLLM log level from environment values."""
        value = "WARNING" if not v else str(v).strip().upper()
        if value not in ALLOWED_LOG_LEVELS:
            raise ValueError(f"Invalid LOG_LLM: {value}. Allowed: {ALLOWED_LOG_LEVELS}")
        return value

    # Server Configuration
    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = False
    log_level: Literal["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"] = "INFO"
    frontend_base_url: str = "http://localhost:3000"

    # Total timeout for AI operations, including validation, database preloads,
    # model attempts and persistence. Nested stages share one deadline. It MUST be
    # kept in sync with the two frontend layers (Next.js `proxyTimeout` and the
    # client AbortController, both driven by NEXT_PUBLIC_REQUEST_TIMEOUT_MS):
    # whichever layer is shortest aborts first, so raising only one silently fails
    # (this is why issue #776's backend-only workaround didn't work). Local LLMs
    # (Ollama, llama.cpp, …) often need longer than the 240s default; bounded to
    # [30, 1800]s so a stuck request can't hold a worker indefinitely.
    request_timeout_seconds: int = 240
    preview_ttl_seconds: int = Field(default=86400, ge=60, le=604800)

    @field_validator("preview_ttl_seconds", mode="before")
    @classmethod
    def clamp_preview_ttl(cls, value: Any) -> int:
        """Keep invalid preview-lifetime settings from preventing startup."""
        try:
            seconds = int(float(str(value).strip()))
        except (TypeError, ValueError, OverflowError):
            return 86400
        return max(60, min(604800, seconds))

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
            raise ValueError(
                f"Invalid LOG_LEVEL: {value}. Allowed: {ALLOWED_LOG_LEVELS}"
            )
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

    # Set by the Docker image (IN_CONTAINER=1). Inside a container "localhost" is the
    # container itself, so a local model server on the host is not reachable there.
    in_container: bool = False

    # Extra hostnames (comma-separated) the API answers for, besides loopback and
    # the FRONTEND_BASE_URL host; "*" allows any. Set it to reach the app by a LAN
    # address or another name, e.g. ALLOWED_HOSTS=192.168.1.20.
    allowed_hosts: str = ""

    @property
    def effective_allowed_hosts(self) -> list[str]:
        """Hosts the API accepts in ``Host`` / ``X-Forwarded-Host`` (DNS rebinding guard)."""
        hosts = set(LOOPBACK_HOSTS)
        frontend_host = urlsplit(self.frontend_base_url.strip()).hostname
        if frontend_host:
            hosts.add(frontend_host)
        hosts.update(h.strip() for h in self.allowed_hosts.split(",") if h.strip())
        return sorted(hosts)

    # Paths
    data_dir: Path = Path(__file__).parent.parent / "data"

    # Optional PostgreSQL backend. Unset: SQLite in data_dir.
    database_url: str | None = None
    database_schema: str | None = None

    @field_validator("database_url", mode="before")
    @classmethod
    def parse_database_url(cls, v: Any) -> str | None:
        if v is None or not str(v).strip():
            return None
        return normalize_database_url(str(v))

    @field_validator("database_schema", mode="before")
    @classmethod
    def validate_database_schema(cls, v: Any) -> str | None:
        if v is None or not str(v).strip():
            return None
        return validate_schema_name(str(v).strip())

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


settings = Settings()

# Deprecated compatibility alias. Runtime config I/O is owned by
# ``settings.config_path`` through ``get_config_path``; downstream tests and
# integrations that explicitly monkeypatch this name continue to work.
CONFIG_FILE_PATH = settings.config_path
_IMPORTED_CONFIG_FILE_PATH = CONFIG_FILE_PATH
