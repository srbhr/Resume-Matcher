import logging
from pathlib import Path
from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.ai_limits import MAX_SOURCE_CHARACTERS
from app.mcp_server.tools._shared import read_document_bytes
from app.services.parser import parse_document

logger = logging.getLogger(__name__)

DOCUMENT_SUFFIXES = {".pdf", ".docx", ".doc"}
TEXT_SUFFIXES = {".md", ".markdown", ".txt"}


async def extract_document_text(file_path: str) -> dict[str, Any]:
    """Extract markdown from a local PDF/DOCX/DOC/MD/TXT file (absolute path)."""
    path = Path(file_path).expanduser()
    suffix = path.suffix.lower()
    if suffix not in DOCUMENT_SUFFIXES | TEXT_SUFFIXES:
        raise ToolError("Unsupported file type. Use PDF, DOCX, DOC, MD or TXT.")
    if not path.is_file():
        raise ToolError(f"File not found: {path}")
    content = await read_document_bytes(path)
    try:
        if suffix in TEXT_SUFFIXES:
            # Same as Path.read_text(): undecodable bytes replaced, universal newlines.
            text = (
                content.decode("utf-8", errors="replace")
                .replace("\r\n", "\n")
                .replace("\r", "\n")
            )
        else:
            text = await parse_document(content, path.name)
    except Exception as e:
        logger.error("Document extraction failed for %s: %s", path, e)
        raise ToolError("Could not extract text from this document.") from e
    if len(text) > MAX_SOURCE_CHARACTERS:
        raise ToolError(f"Extracted text exceeds {MAX_SOURCE_CHARACTERS} characters.")
    return {"markdown": text, "characters": len(text)}
