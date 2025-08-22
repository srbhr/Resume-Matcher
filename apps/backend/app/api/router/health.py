from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, status, Depends

from app.core import get_db_session

health_check = APIRouter()


@health_check.get("/ping", tags=["Health check"], status_code=status.HTTP_200_OK)
async def ping(db: AsyncSession = Depends(get_db_session)):
    """
    health check endpoint
    """
    try:
        result = await db.execute(text("SELECT 1"))
        db_status = "reachable" if result.fetchone() is not None else "not reachable"
    except Exception as e:
        import logging
        logging.error("Database health check failed", exc_info=True)
        db_status = "unreachable"
    return {"message": "pong", "database": db_status}


@health_check.get("/healthz", tags=["Health check"], status_code=status.HTTP_200_OK)
async def healthz(db: AsyncSession = Depends(get_db_session)):
    """
    K8s/Railway style liveness endpoint.
    Returns minimal JSON and verifies DB connectivity.
    """
    try:
        result = await db.execute(text("SELECT 1"))
        db_ok = result.scalar() == 1
    except Exception:
        db_ok = False
    return {"status": "ok", "database": "ok" if db_ok else "degraded"}
