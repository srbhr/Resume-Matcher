"""Application configuration using pydantic-settings."""

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM Configuration
    llm_provider: Literal[
        "openai", "anthropic", "openrouter", "gemini", "deepseek", "ollama"
    ] = "openai"
    llm_model: str = "gpt-4o-mini"
    llm_api_key: str = ""
    llm_api_base: str | None = None  # For Ollama or custom endpoints

    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    frontend_base_url: str = "http://localhost:3000"

    # CORS Configuration
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Paths
    data_dir: Path = Path(__file__).parent.parent / "data"

    @property
    def db_path(self) -> Path:
        """Path to TinyDB database file."""
        return self.data_dir / "database.json"

    @property
    def config_path(self) -> Path:
        """Path to config storage file."""
        return self.data_dir / "config.json"


settings = Settings()
