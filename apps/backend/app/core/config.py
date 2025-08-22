import os
import sys
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional, Literal, cast


class Settings(BaseSettings):
    # The defaults here are just hardcoded to have 'something'. The main place to set defaults is in apps/backend/.env.sample,
    # which is copied to the user's .env file upon setup.
    PROJECT_NAME: str = "Resume Matcher"
    FRONTEND_PATH: str = os.path.join(os.path.dirname(__file__), "frontend", "assets")
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    DB_ECHO: bool = False
    # Optional pool tuning for managed Postgres (e.g., Neon). Leave unset for defaults.
    DB_POOL_SIZE: Optional[int] = None
    DB_MAX_OVERFLOW: Optional[int] = None
    DB_POOL_TIMEOUT: Optional[int] = None
    PYTHONDONTWRITEBYTECODE: int = 1
    # Database URLs: prefer unified DATABASE_URL when present (Railway), map to required drivers
    _DB_URL: str = os.getenv("DATABASE_URL", "").strip()
    if _DB_URL:
        # Normalize common postgres prefixes
        if _DB_URL.startswith("postgres://"):
            _DB_URL = _DB_URL.replace("postgres://", "postgresql://", 1)
        # Sync (psycopg)
        if _DB_URL.startswith("postgresql+psycopg://"):
            SYNC_DATABASE_URL: str = _DB_URL
        elif _DB_URL.startswith("postgresql://"):
            SYNC_DATABASE_URL = _DB_URL.replace("postgresql://", "postgresql+psycopg://", 1)
        else:
            SYNC_DATABASE_URL = _DB_URL  # leave as-is for other engines
        # Async (asyncpg)
        def _to_asyncpg(url: str) -> str:
            # swap driver prefix
            if url.startswith("postgresql+asyncpg://"):
                out = url
            elif url.startswith("postgresql+psycopg://"):
                out = url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)
            elif url.startswith("postgresql://"):
                out = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            else:
                out = url
            # asyncpg expects 'ssl=require' instead of libpq's 'sslmode=require'
            if "sslmode=require" in out and "ssl=" not in out:
                out = out.replace("?sslmode=require", "?ssl=require").replace("&sslmode=require", "&ssl=require")
            return out

        ASYNC_DATABASE_URL = _to_asyncpg(_DB_URL)
    else:
        # Default to SQLite for local dev if not provided; override with Neon Postgres URLs in env
        SYNC_DATABASE_URL: str = os.getenv("SYNC_DATABASE_URL", "sqlite:///./app.db") or "sqlite:///./app.db"
        ASYNC_DATABASE_URL: str = os.getenv("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///./app.db") or "sqlite+aiosqlite:///./app.db"
    SESSION_SECRET_KEY: Optional[str] = None
    LLM_PROVIDER: Optional[str] = "ollama"
    LLM_API_KEY: Optional[str] = None
    LLM_BASE_URL: Optional[str] = None
    LL_MODEL: Optional[str] = "gemma3:4b"
    EMBEDDING_PROVIDER: Optional[str] = "ollama"
    EMBEDDING_API_KEY: Optional[str] = None
    EMBEDDING_BASE_URL: Optional[str] = None
    EMBEDDING_MODEL: Optional[str] = "dengcao/Qwen3-Embedding-0.6B:Q8_0"
    # Rate limiting & security
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 60  # requests per window
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    MAX_UPLOAD_SIZE_MB: int = 5  # Max resume upload size
    MAX_JSON_BODY_SIZE_KB: int = 256  # For JSON endpoints (job upload etc.)
    # Cache maintenance
    LLM_CACHE_CLEAN_INTERVAL_SECONDS: int = 600  # 10 min default
    LLM_CACHE_MAX_DELETE_BATCH: int = 500
    # Testing / deterministic execution
    DISABLE_BACKGROUND_TASKS: bool = False  # If True, run normally deferred tasks inline (helps tests / prevents loop-close races)

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, ".env"),
        env_file_encoding="utf-8",
    )


settings = Settings()


_LEVEL_BY_ENV: dict[Literal["production", "staging", "local"], int] = {
    "production": logging.INFO,
    "staging": logging.DEBUG,
    "local": logging.DEBUG,
}


def setup_logging() -> None:
    """
    Configure the root logger exactly once,

    * Console only (StreamHandler -> stderr)
    * ISO - 8601 timestamps
    * Env - based log level: production -> INFO, else DEBUG
    * Prevents duplicate handler creation if called twice
    """
    root = logging.getLogger()
    if root.handlers:
        return

    raw_env = getattr(settings, "ENV", "production")
    env_norm = str(raw_env).lower()
    # Fallback to production if unexpected value
    if env_norm == "staging":
        env_key: Literal["staging"] = "staging"
    elif env_norm == "local":
        env_key = "local"  # type: ignore[assignment]
    else:
        env_key = "production"  # type: ignore[assignment]
    level = _LEVEL_BY_ENV[cast(Literal["production", "staging", "local"], env_key)]

    formatter = logging.Formatter(
        fmt="[%(asctime)s - %(name)s - %(levelname)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)

    root.setLevel(level)
    root.addHandler(handler)

    for noisy in ("sqlalchemy.engine", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
