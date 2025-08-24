from fastapi import APIRouter

from .job import job_router
from .resume import resume_router
from .match import match_router
from .metrics import metrics_router
from .auth import auth_router
from .cache import cache_router
from ..health import health_check

v1_router = APIRouter(prefix="/api/v1", tags=["v1"])

# Plural canonical prefixes
v1_router.include_router(resume_router, prefix="/resumes")
v1_router.include_router(job_router, prefix="/jobs")

# Backwards compatible singular prefixes (legacy clients / tests)
v1_router.include_router(resume_router, prefix="/resume")
v1_router.include_router(job_router, prefix="/job")

v1_router.include_router(match_router, prefix="/match")
v1_router.include_router(health_check, prefix="/health")
v1_router.include_router(metrics_router, prefix="/metrics")
v1_router.include_router(cache_router)
v1_router.include_router(auth_router, prefix="/auth")


__all__ = ["v1_router"]
