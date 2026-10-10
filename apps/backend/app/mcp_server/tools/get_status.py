from typing import Any

from app import __version__
from app.config import settings
from app.database import MAX_MASTER_RESUMES, db
from app.mcp_server.tools._shared import TEMPLATES


async def get_status() -> dict[str, Any]:
    """Data location, record counts, templates and limits. Call this first."""
    stats = await db.get_stats()
    masters = await db.list_master_resumes()
    return {
        "version": __version__,
        "data_dir": str(settings.data_dir),
        "frontend_base_url": settings.frontend_base_url,
        "templates": TEMPLATES,
        "master_resumes": len(masters),
        "max_master_resumes": MAX_MASTER_RESUMES,
        **stats,
    }
