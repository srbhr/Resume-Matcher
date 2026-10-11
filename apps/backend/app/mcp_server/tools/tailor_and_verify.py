from typing import Any

from app.mcp_server.tools._shared import (
    guard,
    require_job,
    require_resume,
    require_structured,
    store_tailored_resume,
    tailoring_report,
)
from app.mcp_server.tools.verify_resume import MaxPages, verify
from app.schemas import ResumeData
from app.schemas.models import PageFitSettings


@guard
async def tailor_and_verify(
    source_resume_id: str,
    job_id: str,
    resume_data: ResumeData,
    title: str | None = None,
    print_settings: PageFitSettings | None = None,
    max_pages: MaxPages = None,
    track_application: bool = True,
) -> dict[str, Any]:
    """Validate, save and verify a tailored resume you wrote, in one call.

    If validation fails nothing is written and saved is false. Otherwise the resume is saved
    and the result includes the same report as verify_resume. Fix issues with update_resume,
    then call verify_resume.
    """
    source = await require_resume(source_resume_id)
    job = await require_job(job_id)
    candidate = resume_data.model_dump()
    validation = tailoring_report(require_structured(source), candidate)
    if not validation["valid"]:
        return {"saved": False, "validation": validation}
    saved = await store_tailored_resume(
        source, job, candidate, title, track_application
    )
    tailored = await require_resume(saved["resume_id"])
    report = await verify(
        tailored, job_id, print_settings or PageFitSettings(), max_pages
    )
    return {"saved": True, "resume": saved, "validation": validation, **report}
