import os
import sys
import logging
import secrets
from pydantic import Field, validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional, Literal


class Settings(BaseSettings):
    PROJECT_NAME: str = "Resume Matcher"
    FRONTEND_PATH: str = os.path.join(os.path.dirname(__file__), "frontend", "assets")
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    SYNC_DATABASE_URL: Optional[str] = Field(default="sqlite:///./resume_matcher.db")
    ASYNC_DATABASE_URL: Optional[str] = Field(default="sqlite+aiosqlite:///./resume_matcher.db")
    SESSION_SECRET_KEY: Optional[str] = Field(default=None)
    DB_ECHO: bool = False
    PYTHONDONTWRITEBYTECODE: int = 1
    ENV: str = Field(default="production")

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, ".env"),
        env_file_encoding="utf-8",
    )

    @validator('SESSION_SECRET_KEY')
    def validate_secret_key(cls, v):
        if not v:
            # Generate a secure random secret key if not provided
            return secrets.token_urlsafe(32)
        if len(v) < 32:
            raise ValueError('SESSION_SECRET_KEY must be at least 32 characters long')
        return v

    @validator('SYNC_DATABASE_URL')
    def validate_sync_db_url(cls, v):
        if not v:
            raise ValueError('SYNC_DATABASE_URL is required')
        return v

    @validator('ASYNC_DATABASE_URL')
    def validate_async_db_url(cls, v):
        if not v:
            raise ValueError('ASYNC_DATABASE_URL is required')
        return v


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
