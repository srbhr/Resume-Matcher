"""Resume Matcher MCP server over stdio. The calling agent is the LLM."""

import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mcp.server import MCPServer

from app import __version__
from app.config import migrate_legacy_keys, settings
from app.database import db
from app.mcp_server import tools
from app.pdf import close_pdf_renderer
from app.scripts.migrate_tinydb_to_sqlite import migrate

logger = logging.getLogger(__name__)

INSTRUCTIONS = """\
Resume Matcher is a deterministic resume editor, validator and renderer. You are \
the LLM: you write the content, these tools store, check and render it. Nothing \
here deletes data.

Typical flow:
1. get_status, then list_resumes / get_resume. To import a file: \
extract_document_text -> get_resume_schema -> create_master_resume.
2. add_job with the job description and the keywords you extracted from it.
3. Write tailored resume_data from the source resume. Keep personalInfo, \
employers, dates and entry counts; never invent metrics or skills.
4. validate_tailored_resume, fix any violations, then save_tailored_resume.
5. score_resume to check keyword coverage; update_resume to iterate.
6. export_resume_pdf; if page_count is too high, tighten text, update_resume, \
export again. PDF export needs the web frontend running.
"""


@asynccontextmanager
async def lifespan(_server: MCPServer) -> AsyncIterator[None]:
    """Same startup and shutdown steps as the FastAPI app."""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    await migrate()
    migrate_legacy_keys()
    try:
        yield
    finally:
        try:
            await close_pdf_renderer()
        except Exception as e:
            logger.error("Error closing PDF renderer: %s", e)
        await db.close()


def build_server() -> MCPServer:
    server = MCPServer(
        "resume-matcher",
        title="Resume Matcher",
        instructions=INSTRUCTIONS,
        version=__version__,
        lifespan=lifespan,
    )
    for fn in tools.READ_ONLY_TOOLS:
        server.tool(annotations=tools.READ_ONLY)(fn)
    for fn in tools.WRITE_TOOLS:
        server.tool(annotations=tools.WRITE)(fn)
    return server


def main() -> None:
    # stdout carries the protocol; everything else goes to stderr.
    logging.basicConfig(
        stream=sys.stderr,
        level=getattr(logging, settings.log_level, logging.INFO),
        force=True,
    )
    build_server().run("stdio")


if __name__ == "__main__":
    main()
