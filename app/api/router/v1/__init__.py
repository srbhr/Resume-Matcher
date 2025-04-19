from fastapi import APIRouter
from .resume import resume_router
from .job import job_router

v1_router = APIRouter(prefix="/api/v1", tags=["v1"])
v1_router.include_router(resume_router, prefix="/resumes", tags=["resume"])
v1_router.include_router(job_router, prefix="/jobs", tags=["job"])


__all__ = ["v1_router"]
