"""MCP tools, one per module. The calling agent writes content; these store, check and render it."""

from collections.abc import Awaitable, Callable
from typing import Any

from mcp.types import ToolAnnotations

from app.mcp_server.tools.add_job import add_job
from app.mcp_server.tools.create_application import create_application
from app.mcp_server.tools.create_master_resume import create_master_resume
from app.mcp_server.tools.export_resume_pdf import export_resume_pdf
from app.mcp_server.tools.extract_document_text import extract_document_text
from app.mcp_server.tools.get_job import get_job
from app.mcp_server.tools.get_resume import get_resume
from app.mcp_server.tools.get_resume_job import get_resume_job
from app.mcp_server.tools.get_resume_schema import get_resume_schema
from app.mcp_server.tools.get_status import get_status
from app.mcp_server.tools.list_applications import list_applications
from app.mcp_server.tools.list_resumes import list_resumes
from app.mcp_server.tools.parse_check_file import parse_check_file
from app.mcp_server.tools.parse_check_resume import parse_check_resume
from app.mcp_server.tools.save_tailored_resume import save_tailored_resume
from app.mcp_server.tools.score_resume import score_resume
from app.mcp_server.tools.set_cover_letter import set_cover_letter
from app.mcp_server.tools.set_default_master import set_default_master
from app.mcp_server.tools.set_job_keywords import set_job_keywords
from app.mcp_server.tools.set_outreach_message import set_outreach_message
from app.mcp_server.tools.set_resume_title import set_resume_title
from app.mcp_server.tools.tailor_and_verify import tailor_and_verify
from app.mcp_server.tools.update_application import update_application
from app.mcp_server.tools.update_resume import update_resume
from app.mcp_server.tools.validate_tailored_resume import validate_tailored_resume
from app.mcp_server.tools.verify_resume import verify_resume

Tool = Callable[..., Awaitable[dict[str, Any]]]

READ_ONLY_TOOLS: list[Tool] = [
    get_status,
    get_resume_schema,
    list_resumes,
    get_resume,
    get_job,
    get_resume_job,
    extract_document_text,
    validate_tailored_resume,
    score_resume,
    parse_check_file,
    parse_check_resume,
    verify_resume,
    list_applications,
]

WRITE_TOOLS: list[Tool] = [
    create_master_resume,
    update_resume,
    set_resume_title,
    set_cover_letter,
    set_outreach_message,
    set_default_master,
    add_job,
    set_job_keywords,
    save_tailored_resume,
    tailor_and_verify,
    export_resume_pdf,
    create_application,
    update_application,
]

READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)
WRITE = ToolAnnotations(
    read_only_hint=False, destructive_hint=False, open_world_hint=False
)
