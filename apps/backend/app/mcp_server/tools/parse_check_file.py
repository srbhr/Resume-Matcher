import logging
from pathlib import Path
from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.services.ats_parse import parse_check_bytes
from app.services.ats_parse.extract import SUPPORTED_SUFFIXES

logger = logging.getLogger(__name__)

MAX_DOCUMENT_BYTES = 4 * 1024 * 1024


async def parse_check_file(file_path: str) -> dict[str, Any]:
    """ATS parse-check a local PDF or DOCX (absolute path): extractability, layout and content checks."""
    path = Path(file_path).expanduser()
    if path.suffix.lower() not in SUPPORTED_SUFFIXES:
        raise ToolError("Unsupported file type. Use PDF or DOCX.")
    if not path.is_file():
        raise ToolError(f"File not found: {path}")
    if path.stat().st_size > MAX_DOCUMENT_BYTES:
        raise ToolError("File too large. Maximum size is 4MB.")
    try:
        report = await parse_check_bytes(path.read_bytes(), path.name)
    except Exception as e:
        logger.error("Parse check failed for %s: %s", path, e)
        raise ToolError("Could not read this document.") from e
    return report.model_dump()
