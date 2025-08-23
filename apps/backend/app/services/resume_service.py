import os
import uuid
import hashlib
import json
import tempfile
import logging
import time
import asyncio

from markitdown import MarkItDown
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import OperationalError
from pydantic import ValidationError
from typing import Dict, Optional
from sqlalchemy import text

from app.models import Resume, ProcessedResume
from app.metrics.counters import DUPLICATE_RESUME_REUSES
from app.core.database import AsyncSessionLocal
from app.core import settings as core_settings
from app.agent import AgentManager
from app.agent.cache_utils import fetch_or_cache
from app.prompt import prompt_factory
from app.schemas.json import json_schema_factory
from app.schemas.pydantic import StructuredResumeModel
from .exceptions import ResumeNotFoundError, ResumeValidationError

logger = logging.getLogger(__name__)


class ResumeService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.md = MarkItDown(enable_plugins=False)
        self.json_agent_manager = AgentManager()
        logger.debug(
            f"ResumeService initialized with LLM_PROVIDER={self.json_agent_manager.model_provider} "
            f"LL_MODEL={self.json_agent_manager.model}"
        )
        
        # Validate dependencies for DOCX processing
        self._validate_docx_dependencies()

    def _validate_docx_dependencies(self):
        """Validate that required dependencies for DOCX processing are available"""
        missing_deps = []
        
        try:
            # Check if markitdown can handle docx files
            from markitdown.converters import DocxConverter
            # Try to instantiate the converter to check if dependencies are available
            DocxConverter()
        except ImportError:
            missing_deps.append("markitdown[all]==0.1.2")
        except Exception as e:
            if "MissingDependencyException" in str(e) or "dependencies needed to read .docx files" in str(e):
                missing_deps.append("markitdown[all]==0.1.2 (current installation missing DOCX extras)")
        
        if missing_deps:
            logger.warning(
                f"Missing dependencies for DOCX processing: {', '.join(missing_deps)}. "
                f"DOCX file processing may fail. Install with: pip install {' '.join(missing_deps)}"
            )


    async def convert_and_store_resume(
        self,
        file_bytes: bytes,
        file_type: str,
        filename: str,
        content_type: str = "md",
        defer_structured: bool = False,
    ):
        """
        Converts resume file (PDF/DOCX) to text using MarkItDown and stores it in the database.

        Args:
            file_bytes: Raw bytes of the uploaded file
            file_type: MIME type of the file ("application/pdf" or "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            filename: Original filename
            content_type: Output format ("md" for markdown or "html")

        Returns:
            resume_id
        """
        t_start = time.perf_counter()
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=self._get_file_extension(file_type)
        ) as temp_file:
            temp_file.write(file_bytes)
            temp_path = temp_file.name

        try:
            conv_start = time.perf_counter()
            try:
                result = self.md.convert(temp_path)
                text_content = result.text_content
            except Exception as e:
                # Handle specific markitdown conversion errors
                error_msg = str(e)
                if "MissingDependencyException" in error_msg or "DocxConverter" in error_msg:
                    raise Exception(
                        "File conversion failed: markitdown is missing DOCX support. "
                        "Please install with: pip install 'markitdown[all]==0.1.2' or contact system administrator."
                    ) from e
                elif "docx" in error_msg.lower():
                    raise Exception(
                        f"DOCX file processing failed: {error_msg}. "
                        "Please ensure the file is a valid DOCX document."
                    ) from e
                else:
                    raise Exception(f"File conversion failed: {error_msg}") from e

            conv_end = time.perf_counter()
            db_start = time.perf_counter()
            resume_id = await self._store_resume_in_db(text_content, content_type)
            db_end = time.perf_counter()

            if defer_structured:
                # Schedule background extraction with a fresh session.
                # Use asyncio.shield to reduce cancellation surprises during test teardown.
                async def _bg_extract(resume_id: str, resume_text: str):
                    bg_session = None
                    try:
                        bg_session = AsyncSessionLocal()
                        async with bg_session:  # ensures proper close even on exceptions
                            svc = ResumeService(bg_session)
                            await svc._extract_and_store_structured_resume(
                                resume_id=resume_id, resume_text=resume_text
                            )
                            logger.info(
                                f"Deferred structured extraction completed resume_id={resume_id}"
                            )
                    except Exception as e:  # pragma: no cover - defensive
                        logger.error(
                            f"Deferred extraction failed resume_id={resume_id}: {e}"
                        )
                    # Context manager ensures closure; no manual close needed to avoid un-awaited warnings.

                if core_settings.DISABLE_BACKGROUND_TASKS:
                    logger.debug(
                        "DISABLE_BACKGROUND_TASKS enabled; skipping deferred extraction scheduling"
                    )
                else:
                    # If event loop is closing (e.g., test teardown), skip scheduling to avoid warnings
                    loop = asyncio.get_running_loop()
                    if loop.is_closed():
                        logger.debug("Event loop closed; skipping deferred extraction schedule")
                    else:
                        task = asyncio.create_task(_bg_extract(resume_id, text_content))
                        def _done(t: asyncio.Task):  # pragma: no cover - logging only
                            if t.cancelled():
                                return
                            exc = t.exception()
                            if exc:
                                logger.error(f"Deferred extraction task error resume_id={resume_id}: {exc}")
                        task.add_done_callback(_done)
                t_total = time.perf_counter() - t_start
                logger.info(
                    f"Resume processing timings (deferred) resume_id={resume_id} convert={conv_end-conv_start:.2f}s "
                    f"db_store={db_end-db_start:.2f}s struct_extract=DEFERRED total={t_total:.2f}s"
                )
            else:
                struct_start = time.perf_counter()
                await self._extract_and_store_structured_resume(
                    resume_id=resume_id, resume_text=text_content
                )
                struct_end = time.perf_counter()
                t_total = time.perf_counter() - t_start
                logger.info(
                    f"Resume processing timings resume_id={resume_id} convert={conv_end-conv_start:.2f}s "
                    f"db_store={db_end-db_start:.2f}s struct_extract={struct_end-struct_start:.2f}s total={t_total:.2f}s"
                )

            return resume_id
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def _get_file_extension(self, file_type: str) -> str:
        """Returns the appropriate file extension based on MIME type"""
        if file_type == "application/pdf":
            return ".pdf"
        elif (
            file_type
            == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ):
            return ".docx"
        return ""

    async def _store_resume_in_db(self, text_content: str, content_type: str):
        """
        Stores the parsed resume content in the database. If an identical
        resume content (hash) already exists, re-use that resume_id instead
        of inserting a duplicate.
        """
        content_hash = hashlib.sha256(text_content.encode("utf-8")).hexdigest()
        # Attempt to query by content_hash; if column missing (legacy DB), perform
        # a lightweight in-place migration: add the column and backfill hashes.
        try:
            existing = await self.db.execute(
                select(Resume).where(Resume.content_hash == content_hash)
            )
        except OperationalError as e:  # pragma: no cover - exercised in migration scenario
            if "no such column" in str(e).lower():
                logger.warning("content_hash column missing; performing automatic migration")
                await self._ensure_content_hash_column()
                existing = await self.db.execute(
                    select(Resume).where(Resume.content_hash == content_hash)
                )
            else:
                raise
        found = existing.scalars().first()
        if found:
            logger.info(f"Duplicate resume detected; reusing resume_id={found.resume_id}")
            # Increment in-process counter
            try:
                from app.metrics import counters as _mc  # local import to avoid circulars
                _mc.DUPLICATE_RESUME_REUSES += 1  # type: ignore[attr-defined]
            except Exception:  # pragma: no cover - defensive
                pass
            return found.resume_id
        resume_id = str(uuid.uuid4())
        resume = Resume(
            resume_id=resume_id,
            content=text_content,
            content_type=content_type,
            content_hash=content_hash,
        )
        self.db.add(resume)
        await self.db.flush()
        await self.db.commit()
        return resume_id

    async def _ensure_content_hash_column(self):  # pragma: no cover - simple migration utility
        """Ensure the resumes.content_hash column exists; if not, add and backfill.

        SQLite can't DROP constraints easily; we perform a minimal ALTER ADD COLUMN
        then backfill hashes for existing rows with NULL content_hash.
        """
        # 1. Check if column exists
        try:
            res = await self.db.execute(text("PRAGMA table_info(resumes)"))  # type: ignore[name-defined]
            cols = [r[1] for r in res.fetchall()]
        except Exception:
            return
        if "content_hash" not in cols:
            await self.db.execute(text("ALTER TABLE resumes ADD COLUMN content_hash TEXT"))  # type: ignore[name-defined]
            await self.db.commit()
        # 2. Backfill NULLs
        # Fetch rows with NULL or empty hash
        from sqlalchemy import update
        existing_rows = await self.db.execute(select(Resume).where((Resume.content_hash == None) | (Resume.content_hash == "")))  # noqa: E711
        to_update = existing_rows.scalars().all()
        for row in to_update:
            row.content_hash = hashlib.sha256(row.content.encode("utf-8")).hexdigest()
        if to_update:
            await self.db.commit()

    async def _extract_and_store_structured_resume(
        self, resume_id: str, resume_text: str
    ) -> None:
        """
        extract and store structured resume data in the database
        """
        try:
            # Idempotency: if structured data already exists, skip re-processing
            existing = await self.db.execute(select(ProcessedResume).where(ProcessedResume.resume_id == resume_id))
            if existing.scalars().first():
                logger.info(f"ProcessedResume already exists for resume_id={resume_id}; skipping re-insert")
                return
            structured_resume = await self._extract_structured_json(resume_id, resume_text)
            if not structured_resume:
                logger.error("Structured resume extraction returned None.")
                raise ResumeValidationError(
                    resume_id=resume_id,
                    message="Failed to extract structured data from resume. Please ensure your resume contains all required sections.",
                )

            processed_resume = ProcessedResume(
                resume_id=resume_id,
                personal_data=json.dumps(structured_resume.get("personal_data", {}))
                if structured_resume.get("personal_data")
                else None,
                experiences=json.dumps(
                    {"experiences": structured_resume.get("experiences", [])}
                )
                if structured_resume.get("experiences")
                else None,
                projects=json.dumps({"projects": structured_resume.get("projects", [])})
                if structured_resume.get("projects")
                else None,
                skills=json.dumps({"skills": structured_resume.get("skills", [])})
                if structured_resume.get("skills")
                else None,
                research_work=json.dumps(
                    {"research_work": structured_resume.get("research_work", [])}
                )
                if structured_resume.get("research_work")
                else None,
                achievements=json.dumps(
                    {"achievements": structured_resume.get("achievements", [])}
                )
                if structured_resume.get("achievements")
                else None,
                education=json.dumps(
                    {"education": structured_resume.get("education", [])}
                )
                if structured_resume.get("education")
                else None,
                extracted_keywords=json.dumps(
                    {
                        "extracted_keywords": structured_resume.get(
                            "extracted_keywords", []
                        )
                    }
                    if structured_resume.get("extracted_keywords")
                    else None
                ),
            )

            self.db.add(processed_resume)
            await self.db.commit()
        except ResumeValidationError:
            # Re-raise validation errors to propagate to the upload endpoint
            raise
        except Exception as e:
            logger.error(f"Error storing structured resume: {str(e)}")
            raise ResumeValidationError(
                resume_id=resume_id,
                message=f"Failed to store structured resume data: {str(e)}",
            )

    async def _extract_structured_json(
        self, resume_id: str, resume_text: str
    ) -> StructuredResumeModel | None:
        """
        Uses the AgentManager+JSONWrapper to ask the LLM to
        return the data in exact JSON schema we need.
        """
        prompt_template = prompt_factory.get("structured_resume")
        prompt = prompt_template.format(
            json.dumps(json_schema_factory.get("structured_resume"), indent=2),
            resume_text,
        )
        # Avoid logging entire prompt if very large; log sizes & first 300 chars only
        logger.info(
            f"Structured Resume Prompt start len_resume={len(resume_text)} len_prompt={len(prompt)} preview={prompt[:300].replace('\n',' ') + ('...' if len(prompt)>300 else '')}"
        )
        llm_start = time.perf_counter()
        # Caching layer: structured_resume extraction deterministic by prompt content
        async def _runner():
            return await self.json_agent_manager.run(prompt=prompt)
        raw_output = await fetch_or_cache(
            db=self.db,
            model=self.json_agent_manager.model,
            strategy=self.json_agent_manager.strategy,
            prompt=prompt,
            runner=_runner,
            index_entities={"resume": resume_id},
        )
        llm_dur = time.perf_counter() - llm_start
        logger.info(f"Structured Resume LLM call took {llm_dur:.2f}s")

        try:
            # If wrapper added usage key, remove internal metadata before validation
            candidate = dict(raw_output)
            candidate.pop("_usage", None)
            structured_resume: StructuredResumeModel = (
                StructuredResumeModel.model_validate(candidate)
            )
        except ValidationError as e:
            logger.info(f"Validation error: {e}")
            error_details = []
            for error in e.errors():
                field = " -> ".join(str(loc) for loc in error["loc"])
                error_details.append(f"{field}: {error['msg']}")

            user_friendly_message = "Resume validation failed. " + "; ".join(
                error_details
            )
            raise ResumeValidationError(
                validation_error=user_friendly_message,
                message=f"Resume structure validation failed: {user_friendly_message}",
            )
        return structured_resume.model_dump()

    async def get_resume_with_processed_data(self, resume_id: str) -> Optional[Dict]:
        """
        Fetches both resume and processed resume data from the database and combines them.

        Args:
            resume_id: The ID of the resume to retrieve

        Returns:
            Combined data from both resume and processed_resume models

        Raises:
            ResumeNotFoundError: If the resume is not found
        """
        resume_query = select(Resume).where(Resume.resume_id == resume_id)
        resume_result = await self.db.execute(resume_query)
        resume = resume_result.scalars().first()

        if not resume:
            raise ResumeNotFoundError(resume_id=resume_id)

        processed_query = select(ProcessedResume).where(
            ProcessedResume.resume_id == resume_id
        )
        processed_result = await self.db.execute(processed_query)
        processed_resume = processed_result.scalars().first()

        combined_data = {
            "resume_id": resume.resume_id,
            "raw_resume": {
                "id": resume.id,
                "content": resume.content,
                "content_type": resume.content_type,
                "created_at": resume.created_at.isoformat()
                if resume.created_at
                else None,
            },
            "processed_resume": None,
        }

        def _maybe_load(val):
            if val is None:
                return None
            if isinstance(val, (dict, list)):
                return val
            try:
                return json.loads(val)
            except Exception:
                return val

        if processed_resume:
            personal = _maybe_load(processed_resume.personal_data)
            experiences = _maybe_load(processed_resume.experiences) or {}
            projects = _maybe_load(processed_resume.projects) or {}
            skills = _maybe_load(processed_resume.skills) or {}
            research_work = _maybe_load(processed_resume.research_work) or {}
            achievements = _maybe_load(processed_resume.achievements) or {}
            education = _maybe_load(processed_resume.education) or {}
            extracted = _maybe_load(processed_resume.extracted_keywords) or {}
            combined_data["processed_resume"] = {
                "personal_data": personal,
                "experiences": experiences.get("experiences", []) if isinstance(experiences, dict) else experiences,
                "projects": projects.get("projects", []) if isinstance(projects, dict) else projects,
                "skills": skills.get("skills", []) if isinstance(skills, dict) else skills,
                "research_work": research_work.get("research_work", []) if isinstance(research_work, dict) else research_work,
                "achievements": achievements.get("achievements", []) if isinstance(achievements, dict) else achievements,
                "education": education.get("education", []) if isinstance(education, dict) else education,
                "extracted_keywords": extracted.get("extracted_keywords", []) if isinstance(extracted, dict) else extracted,
                "processed_at": processed_resume.processed_at.isoformat() if processed_resume.processed_at else None,
            }

        return combined_data
