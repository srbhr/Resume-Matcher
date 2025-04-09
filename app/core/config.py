import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME="Resume Matcher"
    FRONTEND_PATH=os.path.join(os.path.dirname(__file__), "frontend", "assets")
    ALLOWED_ORIGINS=["https://www.resume-matcher.fyi"]
    DATABASE_URL: str
    SESSION_SECRET_KEY: str

    class Config:
        env_file = ".env"

settings = Settings()