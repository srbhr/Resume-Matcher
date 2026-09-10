"""SQLAlchemy (SQLite) data layer for Resume Matcher.

This is a behavior-preserving replacement for the original TinyDB wrapper. The
``Database`` facade keeps the same method names/signatures and returns **plain
dicts** (never ORM rows), so the ~50 call sites only needed ``await`` added.

Two engines back one SQLite file:
- an **async** engine (``aiosqlite``) for the document tables and applications;
- a **sync** engine for the encrypted ``api_keys`` table, which is read on the
  synchronous LLM hot path (``get_llm_config`` → ``resolve_api_key``).
"""

import copy
import logging
import shutil
import sqlite3
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from sqlalchemy import and_, delete, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db_engine import init_models_sync, make_async_engine, make_sync_engine
from app.models import ApiKey, Application, Improvement, Job, Resume, TailoringPreview
from app.preview import (
    PreviewBusyError,
    PreviewClaim,
    PreviewConflictError,
    PreviewValidationError,
    job_fingerprint,
    resume_fingerprint,
)

logger = logging.getLogger(__name__)

# Columns that are first-class on the jobs table; everything else the pipeline
# attaches dynamically is stored in ``metadata_json`` (see Job model).
_JOB_CORE_FIELDS = frozenset({"job_id", "content", "resume_id", "created_at"})

# Application status columns (stable keys, decoupled from i18n labels).
APPLICATION_STATUSES: tuple[str, ...] = (
    "saved",
    "applied",
    "no_response",
    "response",
    "interview",
    "accepted",
    "rejected",
)
ProcessingFinishOutcome = Literal["committed", "stale", "missing"]


class DatabaseBusyError(RuntimeError):
    """A write reservation could not be obtained; retry the unchanged request."""


@contextmanager
def _translate_write_errors() -> Iterator[None]:
    """Expose only SQLite contention as retryable, for async and sync writers."""
    try:
        yield
    except OperationalError as error:
        code = getattr(error.orig, "sqlite_errorcode", None)
        if isinstance(code, int) and code & 0xFF in (
            sqlite3.SQLITE_BUSY,
            sqlite3.SQLITE_LOCKED,
        ):
            raise DatabaseBusyError("Database is busy") from error
        raise


class ResumeNotFoundError(ValueError):
    """Raised when a write targets a resume ID that no longer exists.

    Subclasses ``ValueError`` deliberately: every pre-existing
    ``except ValueError`` handler around resume writes keeps working unchanged,
    while callers that need to distinguish "the row is gone" from any other
    bad-argument error can catch this type instead of string-matching the
    message (the message is not an API).
    """

    def __init__(self, resume_id: str) -> None:
        self.resume_id = resume_id
        super().__init__(f"Resume not found: {resume_id}")


def _now() -> str:
    """Current UTC time as an ISO-8601 string (TinyDB-era format)."""
    return datetime.now(timezone.utc).isoformat()


class Database:
    """Async SQLAlchemy facade for resume matcher data."""

    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or settings.sqlite_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._async_engine = None
        self._async_session_factory: async_sessionmaker[AsyncSession] | None = None
        self._sync_engine = None
        self._sync_session_factory: sessionmaker[Session] | None = None
        self._initialized = False

    # -- engine / session plumbing ------------------------------------------

    def _ensure_initialized(self) -> None:
        """Create engines and tables once (idempotent).

        Tables are created via the **sync** engine so both the sync (api_keys)
        and async (docs) paths see them immediately, without needing an event
        loop. Both engines point at the same file.
        """
        if self._initialized:
            return
        self._sync_engine = make_sync_engine(self.db_path)
        self._sync_session_factory = sessionmaker(
            self._sync_engine, expire_on_commit=False
        )
        init_models_sync(self._sync_engine)
        self._async_engine = make_async_engine(self.db_path)
        self._async_session_factory = async_sessionmaker(
            self._async_engine, expire_on_commit=False
        )
        self._initialized = True

    @property
    def _session(self) -> async_sessionmaker[AsyncSession]:
        self._ensure_initialized()
        assert self._async_session_factory is not None
        return self._async_session_factory

    @asynccontextmanager
    async def _write_session(self) -> AsyncIterator[AsyncSession]:
        """Reserve SQLite's writer before reading state that a write depends on.

        The database reservation serializes across connections and processes,
        unlike an in-memory lock. Callers commit the complete operation; closing
        the session rolls back every change if any stage raises.
        """
        with _translate_write_errors():
            async with self._session() as session:
                await session.execute(text("BEGIN IMMEDIATE"))
                yield session

    @property
    def _sync(self) -> sessionmaker[Session]:
        self._ensure_initialized()
        assert self._sync_session_factory is not None
        return self._sync_session_factory

    @contextmanager
    def _sync_write_session(self) -> Iterator[Session]:
        """Reserve a synchronous key-store writer with the same busy contract."""
        with _translate_write_errors():
            with self._sync() as session:
                session.execute(text("BEGIN IMMEDIATE"))
                yield session

    async def close(self) -> None:
        """Dispose engines and release file handles."""
        if self._async_engine is not None:
            await self._async_engine.dispose()
            self._async_engine = None
            self._async_session_factory = None
        if self._sync_engine is not None:
            self._sync_engine.dispose()
            self._sync_engine = None
            self._sync_session_factory = None
        self._initialized = False

    # -- row -> dict converters ---------------------------------------------

    @staticmethod
    def _resume_to_dict(row: Resume) -> dict[str, Any]:
        doc: dict[str, Any] = {
            "resume_id": row.resume_id,
            "content": row.content,
            "content_type": row.content_type,
            "filename": row.filename,
            "is_master": row.is_master,
            "parent_id": row.parent_id,
            "processed_data": row.processed_data,
            "processing_status": row.processing_status,
            "cover_letter": row.cover_letter,
            "outreach_message": row.outreach_message,
            "interview_prep": row.interview_prep,
            "title": row.title,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
        # Preserve TinyDB absence semantics: omit the key entirely when None.
        if row.original_markdown is not None:
            doc["original_markdown"] = row.original_markdown
        return doc

    @staticmethod
    def _job_to_dict(row: Job) -> dict[str, Any]:
        doc: dict[str, Any] = {
            "job_id": row.job_id,
            "content": row.content,
            "resume_id": row.resume_id,
            "created_at": row.created_at,
        }
        meta = row.metadata_json or {}
        if isinstance(meta, dict):
            doc.update(meta)  # flatten dynamic fields to top level
        return doc

    @staticmethod
    def _improvement_to_dict(row: Improvement) -> dict[str, Any]:
        return {
            "request_id": row.request_id,
            "original_resume_id": row.original_resume_id,
            "tailored_resume_id": row.tailored_resume_id,
            "job_id": row.job_id,
            "improvements": row.improvements,
            "created_at": row.created_at,
        }

    @staticmethod
    def _application_to_dict(row: Application) -> dict[str, Any]:
        return {
            "application_id": row.application_id,
            "job_id": row.job_id,
            "resume_id": row.resume_id,
            "master_resume_id": row.master_resume_id,
            "status": row.status,
            "company": row.company,
            "role": row.role,
            "applied_at": row.applied_at,
            "notes": row.notes,
            "position": row.position,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    # -- Resume operations --------------------------------------------------

    async def create_resume(
        self,
        content: str,
        content_type: str = "md",
        filename: str | None = None,
        is_master: bool = False,
        parent_id: str | None = None,
        processed_data: dict[str, Any] | None = None,
        processing_status: str = "pending",
        cover_letter: str | None = None,
        outreach_message: str | None = None,
        title: str | None = None,
        original_markdown: str | None = None,
        interview_prep: str | None = None,
    ) -> dict[str, Any]:
        """Create a new resume entry.

        processing_status: "pending", "processing", "ready", "failed"
        """
        row = self._new_resume(
            content=content,
            content_type=content_type,
            filename=filename,
            is_master=is_master,
            parent_id=parent_id,
            processed_data=processed_data,
            processing_status=processing_status,
            cover_letter=cover_letter,
            outreach_message=outreach_message,
            interview_prep=interview_prep,
            title=title,
            original_markdown=original_markdown,
        )
        async with self._write_session() as session:
            session.add(row)
            await session.commit()
        return self._resume_to_dict(row)

    @staticmethod
    def _new_resume(**values: Any) -> Resume:
        """Construct a resume row for standalone or compound transactions."""
        now = _now()
        return Resume(resume_id=str(uuid4()), created_at=now, updated_at=now, **values)

    async def create_resume_atomic_master(
        self,
        content: str,
        content_type: str = "md",
        filename: str | None = None,
        processed_data: dict[str, Any] | None = None,
        processing_status: str = "pending",
        cover_letter: str | None = None,
        outreach_message: str | None = None,
        original_markdown: str | None = None,
        title: str | None = None,
        interview_prep: str | None = None,
    ) -> dict[str, Any]:
        """Create a resume and replace a failed master in one transaction."""
        async with self._write_session() as session:
            current_master = (
                await session.execute(select(Resume).where(Resume.is_master.is_(True)))
            ).scalar_one_or_none()
            is_master = current_master is None
            if current_master and current_master.processing_status in (
                "failed",
                "processing",
            ):
                current_master.is_master = False
                # Release the partial unique-index slot within this transaction.
                # An insertion failure still rolls this demotion back.
                await session.flush()
                is_master = True
            row = self._new_resume(
                content=content,
                content_type=content_type,
                filename=filename,
                is_master=is_master,
                processed_data=processed_data,
                processing_status=processing_status,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                interview_prep=interview_prep,
                title=title,
                original_markdown=original_markdown,
            )
            session.add(row)
            await session.commit()
            return self._resume_to_dict(row)

    async def get_resume(self, resume_id: str) -> dict[str, Any] | None:
        """Get resume by ID."""
        async with self._session() as session:
            row = await session.get(Resume, resume_id)
            return self._resume_to_dict(row) if row else None

    async def get_master_resume(self) -> dict[str, Any] | None:
        """Get the master resume if exists."""
        async with self._session() as session:
            result = await session.execute(
                select(Resume).where(Resume.is_master.is_(True))
            )
            row = result.scalars().first()
            return self._resume_to_dict(row) if row else None

    async def update_resume(
        self, resume_id: str, updates: dict[str, Any]
    ) -> dict[str, Any]:
        """Update resume by ID.

        Raises:
            ResumeNotFoundError: If resume not found. It subclasses
                ``ValueError``, so existing ``except ValueError`` callers are
                unaffected.
        """
        async with self._write_session() as session:
            row = await session.get(Resume, resume_id)
            if row is None:
                raise ResumeNotFoundError(resume_id)
            for key, value in updates.items():
                if hasattr(row, key):
                    setattr(row, key, value)
                else:
                    logger.warning("Ignoring unknown resume field on update: %s", key)
            row.updated_at = _now()
            await session.commit()
            return self._resume_to_dict(row)

    async def claim_resume_processing(
        self,
        resume_id: str,
        *,
        allow_ready_at: str | None = None,
    ) -> str | None:
        """Rotate processing ownership and return its opaque operation token.

        Failed and processing rows are retryable. A legacy ready row is only
        claimable when the caller observed the same version and found its
        structured content empty. ``None`` means a concurrent completion made
        the row ineligible; a missing row raises ``ResumeNotFoundError``.
        """
        token = str(uuid4())
        eligible = Resume.processing_status.in_(("failed", "processing"))
        if allow_ready_at is not None:
            eligible = or_(
                eligible,
                and_(
                    Resume.processing_status == "ready",
                    Resume.updated_at == allow_ready_at,
                ),
            )

        async with self._write_session() as session:
            result = await session.execute(
                update(Resume)
                .where(Resume.resume_id == resume_id, eligible)
                .values(
                    processing_status="processing",
                    processing_token=token,
                    updated_at=_now(),
                )
            )
            if result.rowcount == 1:
                await session.commit()
                return token

            exists = await session.scalar(
                select(Resume.resume_id).where(Resume.resume_id == resume_id)
            )
            if exists is None:
                raise ResumeNotFoundError(resume_id)
            return None

    async def finish_resume_processing(
        self,
        resume_id: str,
        token: str | None,
        *,
        processing_status: Literal["ready", "failed"],
        processed_data: dict[str, Any] | None = None,
    ) -> ProcessingFinishOutcome:
        """Finish an owned attempt, or retire an unclaimed row with ``None``."""
        if token is None and processing_status != "failed":
            raise ValueError("Ready processing requires an ownership token")
        values: dict[str, Any] = {
            "processing_status": processing_status,
            "processing_token": None,
            "updated_at": _now(),
        }
        values["processed_data"] = (
            processed_data if processing_status == "ready" else None
        )

        async with self._write_session() as session:
            result = await session.execute(
                update(Resume)
                .where(
                    Resume.resume_id == resume_id,
                    Resume.processing_token == token,
                    Resume.processing_status == "processing",
                )
                .values(**values)
            )
            if result.rowcount == 1:
                await session.commit()
                return "committed"

            exists = await session.scalar(
                select(Resume.resume_id).where(Resume.resume_id == resume_id)
            )
            return "stale" if exists is not None else "missing"

    async def delete_resume(self, resume_id: str) -> bool:
        """Delete resume by ID."""
        async with self._write_session() as session:
            row = await session.get(Resume, resume_id)
            if row is None:
                return False
            # Keep a content-free consumed marker for deleted results so retries
            # cannot recreate them, while removing their cached personal data.
            previews = await session.execute(
                select(TailoringPreview).where(
                    TailoringPreview.result_resume_id == resume_id,
                )
            )
            for preview in previews.scalars():
                preview.response_data = None
            await session.execute(
                delete(TailoringPreview).where(TailoringPreview.source_id == resume_id)
            )
            await session.delete(row)
            await session.commit()
            return True

    async def list_resumes(self) -> list[dict[str, Any]]:
        """List all resumes."""
        async with self._session() as session:
            result = await session.execute(select(Resume).order_by(Resume.created_at))
            return [self._resume_to_dict(row) for row in result.scalars().all()]

    async def set_master_resume(self, resume_id: str) -> bool:
        """Set a resume as the master, unsetting any existing master.

        Returns False if the resume doesn't exist. Demote-then-promote happens
        in a single transaction so the partial unique index is never violated.
        """
        async with self._write_session() as session:
            target = await session.get(Resume, resume_id)
            if target is None:
                logger.warning("Cannot set master: resume %s not found", resume_id)
                return False

            current = await session.execute(
                select(Resume).where(Resume.is_master.is_(True))
            )
            for row in current.scalars().all():
                if row.resume_id != resume_id:
                    row.is_master = False
            # Flush the demotions before promoting to satisfy the unique index.
            await session.flush()
            target.is_master = True
            await session.commit()
            return True

    # -- Job operations -----------------------------------------------------

    async def create_job(self, content: str, resume_id: str | None = None) -> dict[str, Any]:
        """Create one job description using the atomic batch writer."""
        return (await self.create_jobs([content], resume_id))[0]

    async def create_jobs(
        self, contents: list[str], resume_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Persist a validated job-description batch atomically, in input order."""
        rows = [
            Job(
                job_id=str(uuid4()),
                content=content,
                resume_id=resume_id,
                created_at=_now(),
                metadata_json={},
            )
            for content in contents
        ]
        async with self._write_session() as session:
            session.add_all(rows)
            await session.commit()
        return [self._job_to_dict(row) for row in rows]

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        """Get job by ID (dynamic fields flattened to top level)."""
        async with self._session() as session:
            row = await session.get(Job, job_id)
            return self._job_to_dict(row) if row else None

    async def update_job(
        self, job_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Update a job by ID.

        Core columns are set directly; every other key is merged into
        ``metadata_json`` so dynamic pipeline fields (``preview_hash``,
        ``job_keywords``, ``company``/``role``, …) round-trip through
        ``get_job`` as top-level keys.
        """
        async with self._write_session() as session:
            row = await session.get(Job, job_id)
            if row is None:
                return None
            meta = dict(row.metadata_json or {})
            for key, value in updates.items():
                if key in _JOB_CORE_FIELDS:
                    setattr(row, key, value)
                else:
                    meta[key] = value
            # Reassign so SQLAlchemy detects the JSON mutation.
            row.metadata_json = meta
            await session.commit()
            return self._job_to_dict(row)

    async def delete_job(self, job_id: str) -> bool:
        """Delete a job by ID (used to clean up an orphaned manual-add job)."""
        async with self._write_session() as session:
            row = await session.get(Job, job_id)
            if row is None:
                return False
            await session.execute(
                delete(TailoringPreview).where(TailoringPreview.job_id == job_id)
            )
            await session.delete(row)
            await session.commit()
            return True

    # -- Preview and confirmation operations --------------------------------

    @staticmethod
    async def _validate_preview_inputs(
        session: AsyncSession,
        preview: TailoringPreview,
    ) -> None:
        source = await session.get(Resume, preview.source_id)
        job = await session.get(Job, preview.job_id)
        if (
            source is None
            or job is None
            or resume_fingerprint(
                source.content, source.processed_data, source.original_markdown
            )
            != preview.source_hash
            or job_fingerprint(job.content) != preview.job_hash
        ):
            raise PreviewConflictError(
                "Resume or job description changed. Please retry preview."
            )

    async def register_preview(
        self,
        *,
        source_id: str,
        job_id: str,
        payload_hash: str,
        source_hash: str,
        job_hash: str,
        prompt_id: str,
        ttl_seconds: int,
        improvements: list[dict[str, Any]] | None = None,
    ) -> dict[str, str]:
        """Register the exact input/output snapshot before acknowledging preview."""
        now = _now()
        row = TailoringPreview(
            preview_id=str(uuid4()),
            improvements=copy.deepcopy(improvements or []),
            source_id=source_id,
            job_id=job_id,
            payload_hash=payload_hash,
            source_hash=source_hash,
            job_hash=job_hash,
            created_at=now,
            expires_at=(
                datetime.fromisoformat(now) + timedelta(seconds=ttl_seconds)
            ).isoformat(),
        )
        async with self._write_session() as session:
            await self._validate_preview_inputs(session, row)
            await session.execute(
                delete(TailoringPreview).where(
                    TailoringPreview.expires_at <= now,
                    TailoringPreview.result_resume_id.is_(None),
                    or_(
                        TailoringPreview.claim_token.is_(None),
                        TailoringPreview.claim_expires_at <= now,
                    ),
                )
            )
            job = await session.get(Job, job_id)
            assert job is not None  # Validated in the same reserved transaction.
            metadata = dict(job.metadata_json or {})
            hashes = metadata.get("preview_hashes")
            hashes = dict(hashes) if isinstance(hashes, dict) else {}
            hashes[prompt_id] = payload_hash
            metadata.update(
                preview_hash=payload_hash,
                preview_prompt_id=prompt_id,
                preview_hashes=hashes,
            )
            job.metadata_json = metadata
            session.add(row)
            await session.commit()
        return {"preview_id": row.preview_id, "expires_at": row.expires_at}

    async def claim_preview(
        self,
        *,
        preview_id: str | None,
        source_id: str,
        job_id: str,
        payload_hash: str,
        lease_seconds: int,
    ) -> PreviewClaim:
        """Claim once across workers; committed retries bypass generation."""
        async with self._write_session() as session:
            if preview_id:
                row = await session.get(TailoringPreview, preview_id)
            else:
                # Compatibility for clients that omit the new operation ID.
                row = (
                    await session.execute(
                        select(TailoringPreview)
                        .where(
                            TailoringPreview.source_id == source_id,
                            TailoringPreview.job_id == job_id,
                            TailoringPreview.payload_hash == payload_hash,
                            or_(TailoringPreview.result_resume_id.is_not(None), TailoringPreview.expires_at > _now()),
                        )
                        .order_by(TailoringPreview.result_resume_id.is_not(None).desc(), TailoringPreview.created_at.desc())
                        .limit(1)
                    )
                ).scalar_one_or_none()
            if row is None:
                raise PreviewValidationError(
                    "Preview required before confirmation. Please retry preview."
                )
            if row.source_id != source_id or row.job_id != job_id:
                raise PreviewConflictError(
                    "Preview belongs to different inputs. Please retry preview."
                )
            if row.payload_hash != payload_hash:
                raise PreviewValidationError(
                    "Invalid improved resume data. Please retry preview."
                )
            if row.result_resume_id is not None:
                if (
                    row.response_data is None
                    or await session.get(Resume, row.result_resume_id) is None
                ):
                    raise PreviewConflictError(
                        "Confirmed resume was deleted. Please retry preview."
                    )
                return PreviewClaim(
                    row.preview_id, response=copy.deepcopy(row.response_data)
                )
            now = _now()
            if row.expires_at <= now:
                raise PreviewConflictError("Preview expired. Please retry preview.")
            await self._validate_preview_inputs(session, row)
            if row.claim_token and row.claim_expires_at and row.claim_expires_at > now:
                raise PreviewBusyError(
                    "Confirmation is already in progress. Please retry shortly."
                )
            row.claim_token = str(uuid4())
            row.claim_expires_at = (
                datetime.fromisoformat(now) + timedelta(seconds=lease_seconds)
            ).isoformat()
            await session.commit()
            return PreviewClaim(row.preview_id, token=row.claim_token, improvements=copy.deepcopy(row.improvements or []))

    async def release_preview_claim(self, claim: PreviewClaim) -> None:
        """Release only this request's uncommitted claim, including on cancellation."""
        if not claim.token:
            return
        async with self._write_session() as session:
            row = await session.get(TailoringPreview, claim.preview_id)
            if row is not None and claim.token and row.claim_token == claim.token:
                row.claim_token = None
                row.claim_expires_at = None
                await session.commit()

    async def complete_preview(
        self,
        *,
        claim: PreviewClaim,
        resume_fields: dict[str, Any],
        response_data: dict[str, Any],
        improvements: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Commit resume, required relation and replay snapshot atomically."""
        async with self._write_session() as session:
            preview = await session.get(TailoringPreview, claim.preview_id)
            now = _now()
            if (
                preview is None
                or not claim.token
                or preview.claim_token != claim.token
                or not preview.claim_expires_at
                or preview.claim_expires_at <= now
            ):
                raise PreviewConflictError(
                    "Confirmation ownership expired. Please retry preview."
                )
            await self._validate_preview_inputs(session, preview)
            row = self._new_resume(**resume_fields)
            result = copy.deepcopy(response_data)
            result.update(
                resume_id=row.resume_id,
                preview_id=preview.preview_id,
                preview_expires_at=preview.expires_at,
            )
            session.add(row)
            await session.flush()
            session.add(
                Improvement(
                    request_id=result["request_id"],
                    original_resume_id=preview.source_id,
                    tailored_resume_id=row.resume_id,
                    job_id=preview.job_id,
                    improvements=improvements,
                    created_at=now,
                )
            )
            preview.response_data = result
            preview.result_resume_id = row.resume_id
            preview.claim_token = None
            preview.claim_expires_at = None
            await session.commit()
            return result

    # -- Improvement operations ---------------------------------------------

    async def create_tailored_resume(
        self,
        *,
        request_id: str,
        original_resume_id: str,
        job_id: str,
        resume_fields: dict[str, Any],
        improvements: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Commit a direct tailoring result and its required relation together."""
        row = self._new_resume(**resume_fields)
        async with self._write_session() as session:
            session.add(row)
            await session.flush()
            session.add(
                Improvement(
                    request_id=request_id,
                    original_resume_id=original_resume_id,
                    tailored_resume_id=row.resume_id,
                    job_id=job_id,
                    improvements=copy.deepcopy(improvements),
                    created_at=_now(),
                )
            )
            await session.commit()
        return self._resume_to_dict(row)

    async def create_improvement(
        self,
        original_resume_id: str,
        tailored_resume_id: str,
        job_id: str,
        improvements: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Create an improvement result entry."""
        request_id = str(uuid4())
        now = _now()
        async with self._write_session() as session:
            session.add(
                Improvement(
                    request_id=request_id,
                    original_resume_id=original_resume_id,
                    tailored_resume_id=tailored_resume_id,
                    job_id=job_id,
                    improvements=improvements,
                    created_at=now,
                )
            )
            await session.commit()
        return {
            "request_id": request_id,
            "original_resume_id": original_resume_id,
            "tailored_resume_id": tailored_resume_id,
            "job_id": job_id,
            "improvements": improvements,
            "created_at": now,
        }

    async def get_improvement_by_tailored_resume(
        self, tailored_resume_id: str
    ) -> dict[str, Any] | None:
        """Get improvement record by tailored resume ID."""
        async with self._session() as session:
            result = await session.execute(
                select(Improvement).where(
                    Improvement.tailored_resume_id == tailored_resume_id
                )
            )
            row = result.scalars().first()
            return self._improvement_to_dict(row) if row else None

    # -- Application (tracker) operations -----------------------------------

    async def _next_position(self, session: AsyncSession, status: str) -> int:
        result = await session.execute(
            select(func.count())
            .select_from(Application)
            .where(Application.status == status)
        )
        return int(result.scalar() or 0)

    async def _renumber(self, session: AsyncSession, status: str) -> None:
        """Renumber a column's positions to a contiguous 0..n-1 sequence."""
        result = await session.execute(
            select(Application)
            .where(Application.status == status)
            .order_by(Application.position, Application.created_at)
        )
        for index, row in enumerate(result.scalars().all()):
            if row.position != index:
                row.position = index

    async def _insert_application(
        self,
        session: AsyncSession,
        *,
        job_id: str,
        resume_id: str,
        master_resume_id: str | None = None,
        status: str = "applied",
        company: str | None = None,
        role: str | None = None,
        applied_at: str | None = None,
        notes: str | None = None,
    ) -> Application:
        """Stage one card with shared date and ordering rules, without committing."""
        now = _now()
        if applied_at is None and status != "saved":
            applied_at = now
        position = await self._next_position(session, status)
        row = Application(
            application_id=str(uuid4()),
            job_id=job_id,
            resume_id=resume_id,
            master_resume_id=master_resume_id,
            status=status,
            company=company,
            role=role,
            applied_at=applied_at,
            notes=notes,
            position=position,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        return row

    async def create_manual_application(
        self,
        *,
        content: str,
        resume_id: str,
        status: str = "applied",
        company: str | None = None,
        role: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Commit a pasted job and its tracker card together, or roll back both."""
        async with self._write_session() as session:
            job = Job(
                job_id=str(uuid4()),
                content=content,
                resume_id=resume_id,
                created_at=_now(),
                metadata_json=(
                    {"company": company, "role": role} if company or role else {}
                ),
            )
            session.add(job)
            await session.flush()
            row = await self._insert_application(
                session,
                job_id=job.job_id,
                resume_id=resume_id,
                status=status,
                company=company,
                role=role,
                notes=notes,
            )
            await session.commit()
            return self._application_to_dict(row)

    async def create_application(
        self,
        job_id: str,
        resume_id: str,
        master_resume_id: str | None = None,
        status: str = "applied",
        company: str | None = None,
        role: str | None = None,
        applied_at: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Create a tracker card, deduped on (job_id, resume_id).

        If a card for the same job+resume already exists it is returned as-is
        (survives double-submit / retried confirms).
        """
        # A replay needs only a read. Recheck under the reservation before an
        # insert so concurrent new cards still share the position allocation.
        async with self._session() as session:
            found = await session.scalar(select(Application).where(
                Application.job_id == job_id, Application.resume_id == resume_id
            ))
            if found is not None:
                return self._application_to_dict(found)
        async with self._write_session() as session:
            existing = await session.execute(
                select(Application).where(
                    Application.job_id == job_id, Application.resume_id == resume_id
                )
            )
            found = existing.scalars().first()
            if found is not None:
                return self._application_to_dict(found)

            row = await self._insert_application(
                session,
                job_id=job_id,
                resume_id=resume_id,
                master_resume_id=master_resume_id,
                status=status,
                company=company,
                role=role,
                applied_at=applied_at,
                notes=notes,
            )
            try:
                await session.commit()
            except IntegrityError:
                # A concurrent create won the (job_id, resume_id) unique
                # constraint — return the existing card instead of duplicating.
                await session.rollback()
                dup = await session.execute(
                    select(Application).where(
                        Application.job_id == job_id,
                        Application.resume_id == resume_id,
                    )
                )
                found = dup.scalars().first()
                if found is not None:
                    logger.debug(
                        "Deduped concurrent application create for job=%s resume=%s",
                        job_id,
                        resume_id,
                    )
                    return self._application_to_dict(found)
                raise
            return self._application_to_dict(row)

    async def list_applications(
        self, status: str | None = None
    ) -> list[dict[str, Any]]:
        """List applications ordered by (status, position)."""
        async with self._session() as session:
            stmt = select(Application)
            if status is not None:
                stmt = stmt.where(Application.status == status)
            stmt = stmt.order_by(Application.status, Application.position)
            result = await session.execute(stmt)
            return [self._application_to_dict(row) for row in result.scalars().all()]

    async def get_application(self, application_id: str) -> dict[str, Any] | None:
        """Get an application by ID."""
        async with self._session() as session:
            row = await session.get(Application, application_id)
            return self._application_to_dict(row) if row else None

    async def update_application(
        self, application_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Update an application; renumber columns when status/position change.

        ``position`` is interpreted as the desired index within the (possibly
        new) ``status`` column; siblings are renumbered server-side so the
        column stays a contiguous 0..n-1 sequence.
        """
        async with self._write_session() as session:
            row = await session.get(Application, application_id)
            if row is None:
                return None

            old_status = row.status
            new_status = updates.get("status", old_status)
            target_position = updates.get("position", None)

            for key in ("company", "role", "applied_at", "notes"):
                if key in updates:
                    setattr(row, key, updates[key])

            if (
                old_status == "saved"
                and new_status != "saved"
                and row.applied_at is None
                and "applied_at" not in updates
            ):
                row.applied_at = _now()

            moved = "status" in updates or "position" in updates
            if moved:
                row.status = new_status
                # Park it out of the way, renumber both columns, then reinsert.
                row.position = 10_000_000
                await session.flush()
                if old_status != new_status:
                    await self._renumber(session, old_status)
                # Renumber the target column excluding this row, then splice in.
                siblings = await session.execute(
                    select(Application)
                    .where(
                        Application.status == new_status,
                        Application.application_id != application_id,
                    )
                    .order_by(Application.position, Application.created_at)
                )
                ordered = list(siblings.scalars().all())
                if target_position is None or target_position > len(ordered):
                    target_position = len(ordered)
                if target_position < 0:
                    target_position = 0
                ordered.insert(target_position, row)
                for index, item in enumerate(ordered):
                    item.position = index

            row.updated_at = _now()
            await session.commit()
            return self._application_to_dict(row)

    async def bulk_update_applications(
        self, application_ids: list[str], status: str
    ) -> int:
        """Move many applications to the end of ``status``. Returns count moved."""
        moved = 0
        async with self._write_session() as session:
            affected_old: set[str] = set()
            for application_id in application_ids:
                row = await session.get(Application, application_id)
                if row is None:
                    continue
                affected_old.add(row.status)
                if (
                    row.status == "saved"
                    and status != "saved"
                    and row.applied_at is None
                ):
                    row.applied_at = _now()
                row.status = status
                row.position = 20_000_000 + moved  # provisional, renumbered below
                row.updated_at = _now()
                moved += 1
            await session.flush()
            for old_status in affected_old - {status}:
                await self._renumber(session, old_status)
            await self._renumber(session, status)
            await session.commit()
        return moved

    async def delete_application(self, application_id: str) -> bool:
        """Delete an application; renumber its column."""
        async with self._write_session() as session:
            row = await session.get(Application, application_id)
            if row is None:
                return False
            status = row.status
            await session.delete(row)
            await session.flush()
            await self._renumber(session, status)
            await session.commit()
            return True

    async def bulk_delete_applications(self, application_ids: list[str]) -> int:
        """Delete many applications; renumber affected columns. Returns count."""
        deleted = 0
        async with self._write_session() as session:
            affected: set[str] = set()
            for application_id in application_ids:
                row = await session.get(Application, application_id)
                if row is None:
                    continue
                affected.add(row.status)
                await session.delete(row)
                deleted += 1
            await session.flush()
            for status in affected:
                await self._renumber(session, status)
            await session.commit()
        return deleted

    # -- Encrypted API key store (sync; read on the LLM hot path) -----------

    def get_api_key_ciphertexts(self) -> dict[str, str]:
        """Return ``{provider: ciphertext}`` for all stored keys (sync)."""
        with self._sync() as session:
            rows = session.execute(select(ApiKey)).scalars().all()
            return {row.provider: row.ciphertext for row in rows}

    def set_api_key_ciphertext(self, provider: str, ciphertext: str) -> None:
        """Upsert one provider's ciphertext (sync)."""
        with self._sync_write_session() as session:
            row = session.get(ApiKey, provider)
            if row is None:
                session.add(
                    ApiKey(provider=provider, ciphertext=ciphertext, updated_at=_now())
                )
            else:
                row.ciphertext = ciphertext
                row.updated_at = _now()
            session.commit()

    def delete_api_key(self, provider: str) -> None:
        """Delete one provider's key (sync)."""
        with self._sync_write_session() as session:
            row = session.get(ApiKey, provider)
            if row is not None:
                session.delete(row)
                session.commit()

    def clear_api_keys(self) -> None:
        """Delete all stored keys (sync)."""
        with self._sync_write_session() as session:
            session.execute(delete(ApiKey))
            session.commit()

    def replace_api_keys(self, ciphertexts: dict[str, str]) -> None:
        """Atomically replace the whole key store (clear + insert in one txn).

        A single transaction means a failure mid-write can't leave the store
        half-cleared and wipe a user's previously saved keys.
        """
        with self._sync_write_session() as session:
            session.execute(delete(ApiKey))
            now = _now()
            for provider, ciphertext in ciphertexts.items():
                if ciphertext:
                    session.add(
                        ApiKey(provider=provider, ciphertext=ciphertext, updated_at=now)
                    )
            session.commit()

    # -- Stats / maintenance ------------------------------------------------

    async def get_stats(self) -> dict[str, Any]:
        """Get database statistics."""
        async with self._session() as session:
            resumes = await session.scalar(select(func.count()).select_from(Resume))
            jobs = await session.scalar(select(func.count()).select_from(Job))
            improvements = await session.scalar(
                select(func.count()).select_from(Improvement)
            )
            master = await session.execute(
                select(Resume.resume_id).where(Resume.is_master.is_(True)).limit(1)
            )
            return {
                "total_resumes": int(resumes or 0),
                "total_jobs": int(jobs or 0),
                "total_improvements": int(improvements or 0),
                "has_master_resume": master.first() is not None,
            }

    async def reset_database(self) -> None:
        """Reset by truncating user-document tables and clearing uploads.

        Clears resumes/jobs/improvements, preview replay data, and tracker applications (leaving
        orphaned cards after a full data reset would be a bug). Encrypted
        ``api_keys`` are preserved — matching the pre-existing behavior where a
        reset never wiped the user's stored credentials.
        """
        async with self._write_session() as session:
            await session.execute(delete(TailoringPreview))
            await session.execute(delete(Application))
            await session.execute(delete(Improvement))
            await session.execute(delete(Job))
            await session.execute(delete(Resume))
            await session.commit()

        uploads_dir = settings.data_dir / "uploads"
        if uploads_dir.exists():
            shutil.rmtree(uploads_dir)
            uploads_dir.mkdir(parents=True, exist_ok=True)


# Global database instance
db = Database()
