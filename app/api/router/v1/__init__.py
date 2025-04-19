from fastapi import APIRouter
from .resume import resume_router

v1_router = APIRouter(prefix="/api/v1", tags=["v1"])
v1_router.include_router(resume_router, prefix="/resume", tags=["resume"])
