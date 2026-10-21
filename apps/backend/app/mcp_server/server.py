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
here deletes a resume or job, but update_resume, set_resume_title, \
set_cover_letter, set_outreach_message, set_default_master, set_job_keywords and \
update_application overwrite what is stored, and export_resume_pdf overwrites any \
existing file at its output path. Check what is there before you pick a target; \
tailor_and_verify and save_tailored_resume add new versions without overwriting.

Typical flow:
1. get_status, then list_resumes / get_resume. To import a file: \
extract_document_text -> get_resume_schema -> create_master_resume.
2. add_job with the job description and the keywords you extracted from it.
3. Write tailored resume_data from the source resume. Keep personalInfo, \
employers, dates and entry counts; never invent metrics or skills.
4. tailor_and_verify with the source, job, resume_data and print_settings. It \
validates, saves, renders once, parse-checks and scores. If saved is false, fix \
the violations and call it again.
5. For each code in issues, edit with update_resume, then verify_resume. On \
multi_column or low_order_fidelity, suggest a single-column template. On \
weak_writing, rewrite the lines in writing.findings (no em dashes, no weak \
openers, every fact of the line kept, nothing added). PDF \
rendering needs the web frontend running. recalculate_ats_score refreshes the \
score the builder shows after edits.
6. export_resume_pdf to write the final file.
The single-step tools (validate_tailored_resume, save_tailored_resume, \
score_resume, parse_check_resume) remain available.
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
        try:
            await db.close()
        except Exception as e:
            logger.error("Error closing database: %s", e)


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
    for fn in tools.ADDITIVE_TOOLS:
        server.tool(annotations=tools.ADDITIVE)(fn)
    for fn in tools.DESTRUCTIVE_TOOLS:
        server.tool(annotations=tools.DESTRUCTIVE)(fn)
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
