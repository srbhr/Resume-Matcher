"""TinyDB database layer for JSON storage."""

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from tinydb import Query, TinyDB
from tinydb.table import Table

from app.config import settings

logger = logging.getLogger(__name__)


class Database:
    """TinyDB wrapper for resume matcher data."""

    _master_resume_lock = asyncio.Lock()

    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or settings.db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db: TinyDB | None = None

    @property
    def db(self) -> TinyDB:
        """Lazy initialization of TinyDB instance."""
        if self._db is None:
            self._db = TinyDB(self.db_path)
        return self._db

    @property
    def resumes(self) -> Table:
        """Resumes table."""
        return self.db.table("resumes")

    @property
    def jobs(self) -> Table:
        """Job descriptions table."""
        return self.db.table("jobs")

    @property
    def improvements(self) -> Table:
        """Improvement results table."""
        return self.db.table("improvements")

    @property
    def resume_json_backups(self) -> Table:
        """Backups created before browser JSON imports overwrite resumes."""
        return self.db.table("resume_json_backups")

    def close(self) -> None:
        """Close database connection."""
        if self._db is not None:
            self._db.close()
            self._db = None

    # Resume operations
    def create_resume(
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
        template_settings: dict[str, Any] | None = None,
        document_kind: str = "resume",
        resume_download_filename: str | None = None,
        cv_download_filename: str | None = None,
    ) -> dict[str, Any]:
        """Create a new resume entry.

        processing_status: "pending", "processing", "ready", "failed"
        document_kind: "resume" or "cv"
        """
        resume_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc: dict[str, Any] = {
            "resume_id": resume_id,
            "content": content,
            "content_type": content_type,
            "filename": filename,
            "is_master": is_master,
            "parent_id": parent_id,
            "processed_data": processed_data,
            "processing_status": processing_status,
            "cover_letter": cover_letter,
            "outreach_message": outreach_message,
            "title": title,
            "document_kind": document_kind,
            "created_at": now,
            "updated_at": now,
        }
        if original_markdown is not None:
            doc["original_markdown"] = original_markdown
        if template_settings is not None:
            doc["template_settings"] = template_settings
        if resume_download_filename is not None:
            doc["resume_download_filename"] = resume_download_filename
        if cv_download_filename is not None:
            doc["cv_download_filename"] = cv_download_filename
        self.resumes.insert(doc)
        return doc

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
        document_kind: str = "resume",
        resume_download_filename: str | None = None,
        cv_download_filename: str | None = None,
    ) -> dict[str, Any]:
        """Create a new master resume.

        Multiple master resumes are supported — each upload through this path
        becomes its own master. The asyncio.Lock keeps concurrent uploads from
        racing during creation.
        """
        async with self._master_resume_lock:
            return self.create_resume(
                content=content,
                content_type=content_type,
                filename=filename,
                is_master=True,
                processed_data=processed_data,
                processing_status=processing_status,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                original_markdown=original_markdown,
                title=title,
                document_kind=document_kind,
                resume_download_filename=resume_download_filename,
                cv_download_filename=cv_download_filename,
            )

    def get_counterpart_for_master(
        self, master_id: str, kind: str
    ) -> dict[str, Any] | None:
        """Return the child document of `kind` linked to this master, or None.

        Used to look up the CV that belongs to a resume master (or vice versa).
        """
        Resume = Query()
        children = self.resumes.search(
            (Resume.parent_id == master_id) & (Resume.document_kind == kind)
        )
        return children[0] if children else None

    def get_documents_for_master(
        self, master: dict[str, Any]
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """Return (resume_doc, cv_doc) for a master record.

        The master itself is one of the two; the counterpart (if any) is a
        child row linked via parent_id with the opposite document_kind.
        """
        master_kind = master.get("document_kind", "resume")
        master_id = master["resume_id"]
        if master_kind == "resume":
            cv = self.get_counterpart_for_master(master_id, "cv")
            return master, cv
        else:
            resume = self.get_counterpart_for_master(master_id, "resume")
            return resume, master

    def get_resume(self, resume_id: str) -> dict[str, Any] | None:
        """Get resume by ID."""
        Resume = Query()
        result = self.resumes.search(Resume.resume_id == resume_id)
        return result[0] if result else None

    def get_master_resume(self) -> dict[str, Any] | None:
        """Get the most recently updated master resume, if any exists.

        Kept for callers (refinement, status) that just want "a" master. Prefer
        list_master_resumes() or resolve_master_for_resume() when a specific
        master is needed.
        """
        masters = self.list_master_resumes()
        return masters[0] if masters else None

    def list_master_resumes(self) -> list[dict[str, Any]]:
        """Return every resume flagged as master, newest update first."""
        Resume = Query()
        masters = self.resumes.search(Resume.is_master == True)
        return sorted(
            masters,
            key=lambda r: r.get("updated_at") or r.get("created_at") or "",
            reverse=True,
        )

    def resolve_master_for_resume(
        self, resume: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Return the master resume that a tailored resume belongs to.

        - If `resume` is itself a master, returns it.
        - If `resume` has a parent_id, returns that parent (if it's a master).
        - Otherwise falls back to the most recent master (legacy data).
        """
        if resume.get("is_master"):
            return resume
        parent_id = resume.get("parent_id")
        if parent_id:
            parent = self.get_resume(parent_id)
            if parent and parent.get("is_master"):
                return parent
        return self.get_master_resume()

    def update_resume(self, resume_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        """Update resume by ID.

        Raises:
            ValueError: If resume not found.
        """
        Resume = Query()
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        updated_count = self.resumes.update(updates, Resume.resume_id == resume_id)

        if not updated_count:
            raise ValueError(f"Resume not found: {resume_id}")

        result = self.get_resume(resume_id)
        if not result:
            raise ValueError(f"Resume disappeared after update: {resume_id}")

        return result

    def create_resume_json_backup(
        self,
        resume: dict[str, Any],
        source: str = "json_upload",
    ) -> dict[str, Any]:
        """Create a point-in-time backup before replacing resume JSON."""
        now = datetime.now(timezone.utc).isoformat()
        backup = {
            "backup_id": str(uuid4()),
            "resume_id": resume["resume_id"],
            "source": source,
            "created_at": now,
            "previous_content": resume.get("content"),
            "previous_content_type": resume.get("content_type"),
            "previous_processed_data": resume.get("processed_data"),
            "previous_processing_status": resume.get("processing_status"),
            "previous_title": resume.get("title"),
            "previous_filename": resume.get("filename"),
            "previous_updated_at": resume.get("updated_at"),
        }
        self.resume_json_backups.insert(backup)
        return backup

    def list_resume_json_backups(self, resume_id: str) -> list[dict[str, Any]]:
        """Return backups for a resume, newest first."""
        Backup = Query()
        rows = self.resume_json_backups.search(Backup.resume_id == resume_id)
        return sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True)

    def get_resume_json_backup(self, backup_id: str) -> dict[str, Any] | None:
        """Fetch a specific backup by id."""
        Backup = Query()
        rows = self.resume_json_backups.search(Backup.backup_id == backup_id)
        return rows[0] if rows else None

    # Chat conversation history

    MAX_UNPINNED_CONVERSATIONS: int = 5

    @property
    def chat_conversations(self) -> Table:
        """Chat conversation history table."""
        return self.db.table("chat_conversations")

    def list_chat_conversations(self, resume_id: str) -> list[dict[str, Any]]:
        """Return all conversations for a resume, newest updated first."""
        Conv = Query()
        rows = self.chat_conversations.search(Conv.resume_id == resume_id)
        return sorted(rows, key=lambda r: r.get("updated_at") or "", reverse=True)

    def get_chat_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        """Fetch a single conversation by ID."""
        Conv = Query()
        rows = self.chat_conversations.search(Conv.conversation_id == conversation_id)
        return rows[0] if rows else None

    def create_chat_conversation(
        self,
        resume_id: str,
        document_type: str,
        mode: str,
        messages: list[dict[str, Any]],
        title: str,
    ) -> dict[str, Any]:
        """Create a conversation and evict oldest unpinned ones if over limit."""
        now = datetime.now(timezone.utc).isoformat()
        doc: dict[str, Any] = {
            "conversation_id": str(uuid4()),
            "resume_id": resume_id,
            "document_type": document_type,
            "mode": mode,
            "messages": messages,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "pinned": False,
            "message_count": len(messages),
        }
        self.chat_conversations.insert(doc)
        self._evict_old_conversations(resume_id)
        return doc

    def _evict_old_conversations(self, resume_id: str) -> None:
        """Delete oldest unpinned conversations beyond MAX_UNPINNED_CONVERSATIONS."""
        Conv = Query()
        unpinned = self.chat_conversations.search(
            (Conv.resume_id == resume_id) & (Conv.pinned == False)  # noqa: E712
        )
        by_age = sorted(unpinned, key=lambda r: r.get("updated_at") or "", reverse=True)
        for old in by_age[self.MAX_UNPINNED_CONVERSATIONS:]:
            self.chat_conversations.remove(
                Conv.conversation_id == old["conversation_id"]
            )

    def update_chat_conversation_messages(
        self,
        conversation_id: str,
        messages: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        """Replace the messages of an existing conversation."""
        Conv = Query()
        now = datetime.now(timezone.utc).isoformat()
        updated = self.chat_conversations.update(
            {"messages": messages, "updated_at": now, "message_count": len(messages)},
            Conv.conversation_id == conversation_id,
        )
        return self.get_chat_conversation(conversation_id) if updated else None

    def toggle_chat_conversation_pin(self, conversation_id: str) -> dict[str, Any] | None:
        """Toggle pinned state; runs eviction after unpinning."""
        Conv = Query()
        row = self.get_chat_conversation(conversation_id)
        if not row:
            return None
        new_pinned = not row.get("pinned", False)
        self.chat_conversations.update(
            {"pinned": new_pinned},
            Conv.conversation_id == conversation_id,
        )
        if not new_pinned:
            self._evict_old_conversations(row["resume_id"])
        return self.get_chat_conversation(conversation_id)

    def delete_chat_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation. Returns True if found and deleted."""
        Conv = Query()
        removed = self.chat_conversations.remove(Conv.conversation_id == conversation_id)
        return bool(removed)

    def delete_resume(self, resume_id: str) -> bool:
        """Delete resume by ID."""
        Resume = Query()
        removed = self.resumes.remove(Resume.resume_id == resume_id)
        return len(removed) > 0

    def list_resumes(self) -> list[dict[str, Any]]:
        """List all resumes."""
        return list(self.resumes.all())

    def set_master_resume(self, resume_id: str) -> bool:
        """Mark a resume as a master without affecting other masters.

        Returns False if the resume doesn't exist.
        """
        Resume = Query()

        target = self.resumes.search(Resume.resume_id == resume_id)
        if not target:
            logger.warning("Cannot set master: resume %s not found", resume_id)
            return False

        updated = self.resumes.update(
            {"is_master": True}, Resume.resume_id == resume_id
        )
        return len(updated) > 0

    # Job operations
    def create_job(self, content: str, resume_id: str | None = None) -> dict[str, Any]:
        """Create a new job description entry."""
        job_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc = {
            "job_id": job_id,
            "content": content,
            "resume_id": resume_id,
            "created_at": now,
        }
        self.jobs.insert(doc)
        return doc

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        """Get job by ID."""
        Job = Query()
        result = self.jobs.search(Job.job_id == job_id)
        return result[0] if result else None

    def update_job(self, job_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        """Update a job by ID."""
        Job = Query()
        updated = self.jobs.update(updates, Job.job_id == job_id)
        if not updated:
            return None
        return self.get_job(job_id)

    # Improvement operations
    def create_improvement(
        self,
        original_resume_id: str,
        tailored_resume_id: str,
        job_id: str,
        improvements: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Create an improvement result entry."""
        request_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc = {
            "request_id": request_id,
            "original_resume_id": original_resume_id,
            "tailored_resume_id": tailored_resume_id,
            "job_id": job_id,
            "improvements": improvements,
            "created_at": now,
        }
        self.improvements.insert(doc)
        return doc

    def get_improvement_by_tailored_resume(
        self, tailored_resume_id: str
    ) -> dict[str, Any] | None:
        """Get improvement record by tailored resume ID.

        This is used to retrieve the job context for on-demand
        cover letter and outreach message generation.
        """
        Improvement = Query()
        result = self.improvements.search(
            Improvement.tailored_resume_id == tailored_resume_id
        )
        return result[0] if result else None

    # Stats
    def get_stats(self) -> dict[str, Any]:
        """Get database statistics."""
        return {
            "total_resumes": len(self.resumes),
            "total_jobs": len(self.jobs),
            "total_improvements": len(self.improvements),
            "has_master_resume": self.get_master_resume() is not None,
        }

    def reset_database(self) -> None:
        """Reset the database by truncating all tables and clearing uploads."""
        # Truncate tables
        self.resumes.truncate()
        self.jobs.truncate()
        self.improvements.truncate()
        self.chat_conversations.truncate()

        # Clear uploads directory
        uploads_dir = settings.data_dir / "uploads"
        if uploads_dir.exists():
            import shutil

            shutil.rmtree(uploads_dir)
            uploads_dir.mkdir(parents=True, exist_ok=True)


# Global database instance
db = Database()
