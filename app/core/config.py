import os
from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    PROJECT_NAME: str="Resume Matcher"
    FRONTEND_PATH: str=os.path.join(os.path.dirname(__file__), "frontend", "assets")
    ALLOWED_ORIGINS: List[str]=["https://www.resumematcher.fyi"]
    DATABASE_URL: Optional[str]
    SESSION_SECRET_KEY: Optional[str]
    PYTHONDONTWRITEBYTECODE: int=1

    class Config:
        env_file = ".env"

settings = Settings()
