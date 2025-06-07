import os
import sys
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional, Literal


class Settings(BaseSettings):
    # Project
    PROJECT_NAME: str = "Resume Matcher"
    ENV: Literal["production", "staging", "local"] = "production"
    DEBUG: bool = False
    API_VERSION: str = "v1"
    
    # Frontend
    FRONTEND_PATH: str = os.path.join(os.path.dirname(__file__), "frontend", "assets")
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    CORS_MAX_AGE: int = 86400  # 24 hours
    
    # Database  
    SYNC_DATABASE_URL: Optional[str] = None
    ASYNC_DATABASE_URL: Optional[str] = None
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40
    DB_POOL_PRE_PING: bool = True
    DB_POOL_RECYCLE: int = 3600  # 1 hour
    DB_CONNECT_TIMEOUT: int = 10
    
    # Redis Cache
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL: int = 300  # 5 minutes default
    CACHE_KEY_PREFIX: str = "resume_matcher:"
    
    # Security
    SESSION_SECRET_KEY: Optional[str] = None
    JWT_SECRET_KEY: Optional[str] = None
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 30
    BCRYPT_ROUNDS: int = 12
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_HOUR: int = 1000
    
    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 10
    ALLOWED_FILE_EXTENSIONS: List[str] = [".pdf", ".docx", ".doc", ".txt"]
    UPLOAD_CHUNK_SIZE: int = 1024 * 1024  # 1MB chunks
    
    # Worker/Background Tasks
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    TASK_TIMEOUT: int = 300  # 5 minutes
    
    # Monitoring
    SENTRY_DSN: Optional[str] = None
    APM_ENABLED: bool = False
    METRICS_ENABLED: bool = True
    
    # Performance
    PYTHONDONTWRITEBYTECODE: int = 1
    REQUEST_TIMEOUT: int = 30
    SLOW_QUERY_THRESHOLD: float = 0.5  # seconds
    
    # Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "gemma3:4b"
    OLLAMA_TIMEOUT: int = 120
    
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()


_LEVEL_BY_ENV: dict[Literal["production", "staging", "local"], int] = {
    "production": logging.INFO,
    "staging": logging.DEBUG,
    "local": logging.DEBUG,
}


def setup_logging() -> None:
    """
    Configure the root logger with production-ready settings.
    
    * Structured logging with JSON format in production
    * Console output with ISO-8601 timestamps
    * Environment-based log levels
    * Prevents duplicate handler creation
    """
    root = logging.getLogger()
    if root.handlers:
        return

    env = settings.ENV.lower()
    level = _LEVEL_BY_ENV.get(env, logging.INFO)

    # Use JSON formatting in production for better log aggregation
    if env == "production":
        import json
        
        class JSONFormatter(logging.Formatter):
            def format(self, record):
                log_obj = {
                    "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
                    "level": record.levelname,
                    "logger": record.name,
                    "message": record.getMessage(),
                    "module": record.module,
                    "function": record.funcName,
                    "line": record.lineno,
                }
                if hasattr(record, "request_id"):
                    log_obj["request_id"] = record.request_id
                if record.exc_info:
                    log_obj["exception"] = self.formatException(record.exc_info)
                return json.dumps(log_obj)
        
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            fmt="[%(asctime)s - %(name)s - %(levelname)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)

    root.setLevel(level)
    root.addHandler(handler)

    # Reduce noise from verbose libraries
    for noisy in ("sqlalchemy.engine", "uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
