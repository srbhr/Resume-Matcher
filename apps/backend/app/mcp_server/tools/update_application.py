from typing import Annotated, Any

from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field
from pydantic.json_schema import JsonSchemaValue, SkipJsonSchema
from pydantic_core import core_schema

from app.database import db
from app.mcp_server.tools._shared import guard
from app.schemas.applications import ApplicationStatus


class _Unset:
    """Default for an omitted argument, so omitted differs from an explicit null."""

    @classmethod
    def __get_pydantic_core_schema__(
        cls, _source: Any, _handler: Any
    ) -> core_schema.CoreSchema:
        return core_schema.is_instance_schema(
            cls,
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda _value: None
            ),
        )


UNSET = _Unset()


def _hide_default(schema: JsonSchemaValue) -> None:
    schema.pop("default", None)


_omittable = Field(json_schema_extra=_hide_default)
StatusArg = Annotated[ApplicationStatus | SkipJsonSchema[_Unset], _omittable]
PositionArg = Annotated[int | None | SkipJsonSchema[_Unset], _omittable]
TextArg = Annotated[str | None | SkipJsonSchema[_Unset], _omittable]


@guard
async def update_application(
    application_id: str,
    status: StatusArg = UNSET,
    position: PositionArg = UNSET,
    notes: TextArg = UNSET,
    company: TextArg = UNSET,
    role: TextArg = UNSET,
) -> dict[str, Any]:
    """Move or edit a tracker card. Omitted fields stay unchanged. Pass null for notes, company or role to clear it, or for position to move the card to the end of its column."""
    updates: dict[str, Any] = {
        key: value
        for key, value in (
            ("position", position),
            ("notes", notes),
            ("company", company),
            ("role", role),
        )
        if value is not UNSET
    }
    if isinstance(status, ApplicationStatus):
        updates["status"] = status.value
    if not updates:
        raise ToolError("Nothing to update.")
    updated = await db.update_application(application_id, updates)
    if not updated:
        raise ToolError(f"Application not found: {application_id}")
    return updated
