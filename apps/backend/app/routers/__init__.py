"""API routers."""

from app.routers.applications import router as applications_router
from app.routers.ats import router as ats_router
from app.routers.chatgpt import callback_router as chatgpt_callback_router
from app.routers.chatgpt import router as chatgpt_router
from app.routers.config import router as config_router
from app.routers.enrichment import router as enrichment_router
from app.routers.health import router as health_router
from app.routers.jobs import router as jobs_router
from app.routers.resume_wizard import router as resume_wizard_router
from app.routers.resumes import router as resumes_router

__all__ = [
    "resumes_router",
    "jobs_router",
    "config_router",
    "health_router",
    "enrichment_router",
    "applications_router",
    "resume_wizard_router",
    "ats_router",
    "chatgpt_router",
    "chatgpt_callback_router",
]
