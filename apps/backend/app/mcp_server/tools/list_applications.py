from typing import Any

from app.database import db
from app.schemas.applications import ApplicationStatus


async def list_applications(status: ApplicationStatus | None = None) -> dict[str, Any]:
    """List tracker cards, optionally for one status column."""
    return {
        "applications": await db.list_applications(status.value if status else None)
    }
