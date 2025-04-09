import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from app.api import health_check
from app.core.config import settings
from app.models import Base
from app.core.database import DatabaseConnectionSingleton

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json"
    )

    app.add_middleware(SessionMiddleware, secret_key = settings.SESSION_SECRET_KEY, same_site="lax")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    db_singleton = DatabaseConnectionSingleton(settings.DATABASE_URL)
    Base.metadata.create_all(bind=db_singleton.engine)
    
    if os.path.exists(settings.FRONTEND_PATH): 
        app.mount("/app", StaticFiles(directory=settings.FRONTEND_PATH, html=True), name=settings.PROJECT_NAME)

    app.include_router(health_check)

    return app
