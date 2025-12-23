"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import settings
from app.database import db
from app.routers import config_router, health_router, jobs_router, resumes_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    yield
    # Shutdown
    db.close()


app = FastAPI(
    title="Resume Matcher API",
    description="AI-powered resume tailoring for job descriptions",
    version=__version__,
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router, prefix="/api/v1")
app.include_router(config_router, prefix="/api/v1")
app.include_router(resumes_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Resume Matcher API",
        "version": __version__,
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
