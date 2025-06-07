import os
import logging

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .api import health_check, v1_router, RequestIDMiddleware
from .core import (
    settings,
    async_engine,
    setup_logging,
    custom_http_exception_handler,
    validation_exception_handler,
    unhandled_exception_handler,
    cache,
    check_database_connection,
)
from .core.security import (
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
)
from .models import Base

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for startup and shutdown tasks.
    """
    # Startup
    logger.info(f"Starting {settings.PROJECT_NAME} in {settings.ENV} mode")
    
    # Initialize database
    try:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
    
    # Check Redis connection
    try:
        redis_health = await cache.health_check()
        if redis_health["status"] == "healthy":
            logger.info("Redis cache connected successfully")
        else:
            logger.warning(f"Redis cache unhealthy: {redis_health}")
    except Exception as e:
        logger.warning(f"Redis cache connection failed: {e}")
    
    # Warm up cache if needed
    # await warm_up_cache()
    
    yield
    
    # Shutdown
    logger.info("Shutting down application")
    
    # Close database connections
    await async_engine.dispose()
    logger.info("Database connections closed")
    
    # Close cache connections
    await cache.close()
    logger.info("Cache connections closed")


def create_app() -> FastAPI:
    """
    Configure and create the FastAPI application instance with production optimizations.
    """
    setup_logging()
    
    # Application metadata
    description = """
    Resume Matcher API - Production-ready resume matching service.
    
    ## Features
    - Resume parsing and analysis
    - Job matching with AI
    - Skill extraction
    - Performance optimization with caching
    - Rate limiting and security
    """
    
    app = FastAPI(
        title=settings.PROJECT_NAME,
        description=description,
        version=settings.API_VERSION,
        docs_url="/api/docs" if settings.ENV != "production" else None,
        redoc_url="/api/redoc" if settings.ENV != "production" else None,
        openapi_url="/api/openapi.json" if settings.ENV != "production" else None,
        lifespan=lifespan,
        # Performance optimizations
        default_response_class=None,  # Use ORJSONResponse for better performance
    )
    
    # Security middleware (order matters - security first)
    app.add_middleware(SecurityHeadersMiddleware)
    
    # Trusted host middleware with environment-specific hosts
    if settings.ENV == "production":
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=["*.resume-matcher.com", "resume-matcher.com"]
        )
    elif settings.ENV in ["staging", "local"]:
        # Allow localhost and common development hosts
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=[
                "localhost",
                "127.0.0.1", 
                "0.0.0.0",
                "*.localhost",
                "*.127.0.0.1",
                "localhost:*",
                "127.0.0.1:*",
                "0.0.0.0:*"
            ]
        )
    
    # Session middleware
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.SESSION_SECRET_KEY,
        same_site="lax",
        https_only=settings.ENV == "production",
    )
    
    # CORS middleware with optimized settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        max_age=settings.CORS_MAX_AGE,
    )
    
    # Rate limiting middleware
    if settings.RATE_LIMIT_ENABLED:
        app.add_middleware(RateLimitMiddleware)
    
    # Compression middleware for response optimization
    app.add_middleware(
        GZipMiddleware,
        minimum_size=1000,  # Only compress responses larger than 1KB
        compresslevel=6,    # Balanced compression level
    )
    
    # Request ID middleware for tracing
    app.add_middleware(RequestIDMiddleware)
    
    # Exception handlers
    app.add_exception_handler(HTTPException, custom_http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    
    # Static files (only in non-production or if explicitly needed)
    if os.path.exists(settings.FRONTEND_PATH):
        app.mount(
            "/app",
            StaticFiles(directory=settings.FRONTEND_PATH, html=True),
            name=settings.PROJECT_NAME,
        )
    
    # API routes
    app.include_router(health_check, tags=["health"])
    app.include_router(v1_router, prefix="/api/v1")
    
    # Root endpoint
    @app.get("/", include_in_schema=False)
    async def root():
        return {
            "name": settings.PROJECT_NAME,
            "version": settings.API_VERSION,
            "status": "operational",
            "environment": settings.ENV,
        }
    
    # Startup event for additional initialization
    @app.on_event("startup")
    async def startup_event():
        """Additional startup tasks."""
        # Verify critical services
        if not await check_database_connection():
            logger.error("Database connection check failed on startup")
        
        # Log application configuration (non-sensitive)
        logger.info(f"CORS Origins: {settings.ALLOWED_ORIGINS}")
        logger.info(f"Rate Limiting: {'Enabled' if settings.RATE_LIMIT_ENABLED else 'Disabled'}")
        logger.info(f"Database Pool Size: {settings.DB_POOL_SIZE}")
    
    return app


# Optional: Create different app configurations for different environments
def create_dev_app() -> FastAPI:
    """Create development app with additional debugging features."""
    app = create_app()
    
    # Add development-specific middleware or routes
    @app.get("/api/debug/config", include_in_schema=False)
    async def debug_config():
        """Show non-sensitive configuration in development."""
        return {
            "env": settings.ENV,
            "debug": settings.DEBUG,
            "db_pool_size": settings.DB_POOL_SIZE,
            "rate_limits": {
                "per_minute": settings.RATE_LIMIT_PER_MINUTE,
                "per_hour": settings.RATE_LIMIT_PER_HOUR,
            },
        }
    
    return app


def create_test_app() -> FastAPI:
    """Create test app with mocked services."""
    # Override settings for testing
    settings.RATE_LIMIT_ENABLED = False
    settings.DB_ECHO = False
    
    app = create_app()
    return app
