import os
import sys
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional, Literal


_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir))
_DEFAULT_DB_PATH = os.path.join(_BACKEND_ROOT, "app.db")


class Settings(BaseSettings):
    # The defaults here provide a fully working local configuration so new
    # contributors can run the stack without editing environment variables.
    PROJECT_NAME: str = "Resume Matcher"
    FRONTEND_PATH: str = os.path.join(os.path.dirname(__file__), "frontend", "assets")
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    DB_ECHO: bool = False
    PYTHONDONTWRITEBYTECODE: int = 1
    SYNC_DATABASE_URL: str = f"sqlite:///{_DEFAULT_DB_PATH}"
    ASYNC_DATABASE_URL: str = f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}"
    SESSION_SECRET_KEY: str = "resume-matcher-dev"
    LLM_PROVIDER: Optional[str] = "ollama"
    LLM_API_KEY: Optional[str] = None
    LLM_BASE_URL: Optional[str] = None
    LL_MODEL: Optional[str] = "gemma3:4b"
    EMBEDDING_PROVIDER: Optional[str] = "ollama"
    EMBEDDING_API_KEY: Optional[str] = None
    EMBEDDING_BASE_URL: Optional[str] = None
    EMBEDDING_MODEL: Optional[str] = "dengcao/Qwen3-Embedding-0.6B:Q8_0"

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

    env = settings.ENV.lower() if hasattr(settings, "ENV") else "production"
    level = _LEVEL_BY_ENV.get(env, logging.INFO)

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
