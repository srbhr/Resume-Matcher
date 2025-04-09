from fastapi import APIRouter, status, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.utils.utils import get_db_session

health_check = APIRouter()

@health_check.get("/ping", tags=["health_check"], status_code=status.HTTP_200_OK)
def ping(db: Session = Depends(get_db_session)):
    """
    health check endpoint
    """
    try:
        result = db.execute(text("SELECT 1")).fetchone()
        db_status = "reachable" if result is not None else "not reachable"
    except Exception as e:
        db_status = f"error: {str(e)}"
    return {"message": "pong", "database": db_status}
