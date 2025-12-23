"""API routers."""

from app.routers.config import router as config_router
from app.routers.health import router as health_router
from app.routers.jobs import router as jobs_router
from app.routers.resumes import router as resumes_router

__all__ = [
    "resumes_router",
    "jobs_router",
    "config_router",
    "health_router",
]
