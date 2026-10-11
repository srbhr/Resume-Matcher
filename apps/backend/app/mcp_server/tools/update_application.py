from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.database import db
from app.mcp_server.tools._shared import guard
from app.schemas.applications import ApplicationStatus


@guard
async def update_application(
    application_id: str,
    status: ApplicationStatus | None = None,
    position: int | None = None,
    notes: str | None = None,
    company: str | None = None,
    role: str | None = None,
) -> dict[str, Any]:
    """Move or edit a tracker card. Only the fields you pass change."""
    updates: dict[str, Any] = {
        key: value
        for key, value in (
            ("position", position),
            ("notes", notes),
            ("company", company),
            ("role", role),
        )
        if value is not None
    }
    if status is not None:
        updates["status"] = status.value
    if not updates:
        raise ToolError("Nothing to update.")
    updated = await db.update_application(application_id, updates)
    if not updated:
        raise ToolError(f"Application not found: {application_id}")
    return updated
