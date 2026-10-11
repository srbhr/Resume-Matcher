"""Background queue worker for sequential resume tailoring with rate limiting and metadata extraction."""

import asyncio
import logging
import re
from typing import Any

from fastapi import HTTPException

from app.ai_budget import operation_budget
from app.ai_limits import PromptSizeError
from app.config import settings
from app.database import DatabaseBusyError, db

logger = logging.getLogger(__name__)


def extract_job_details(text: str) -> dict[str, str]:
    """Heuristically extract role, company, and job_req_id from job description without LLM calls.

    Extracts details quickly and accurately from common job posting formats.
    """
    details: dict[str, str] = {
        "role": "",
        "company": "",
        "job_req_id": "",
    }
    if not text or not text.strip():
        return details

    lines = [line.strip() for line in text.strip().split("\n") if line.strip()]
    if not lines:
        return details

    # 1. Scan for explicit key-value labels in the first 25 lines
    for line in lines[:25]:
        # Role / Position / Title
        if not details["role"]:
            m_role = re.search(
                r"^(?:job\s+title|role|position|title)\s*[:\-]\s*(.+)$",
                line,
                re.IGNORECASE,
            )
            if m_role:
                details["role"] = m_role.group(1).strip()

        # Company / Organization / Client
        if not details["company"]:
            m_comp = re.search(
                r"^(?:company|organization|employer|client)\s*[:\-]\s*(.+)$",
                line,
                re.IGNORECASE,
            )
            if m_comp:
                details["company"] = m_comp.group(1).strip()

        # Job ID / Requisition ID / Req #
        if not details["job_req_id"]:
            m_id = re.search(
                r"(?:job\s*id|req(?:uisition)?\s*id|req\s*#|job\s*#|requisition)\s*[:\-#]?\s*([a-zA-Z0-9_\-]+)",
                line,
                re.IGNORECASE,
            )
            if m_id:
                details["job_req_id"] = m_id.group(1).strip()

    # 2. If role is still empty, look at first 3 non-empty lines
    if not details["role"] and lines:
        first_line = lines[0]
        # Pattern like "Senior Software Engineer at Stripe" or "Frontend Developer @ Google"
        m_at = re.search(
            r"^(.+?)\s+(?:at|@)\s+([A-Za-z0-9&.\s]{2,40})$",
            first_line,
            re.IGNORECASE,
        )
        if m_at:
            details["role"] = m_at.group(1).strip()
            if not details["company"]:
                details["company"] = m_at.group(2).strip()
        elif len(first_line) < 70 and not any(
            w in first_line.lower()
            for w in ["about us", "overview", "description", "welcome"]
        ):
            details["role"] = first_line

    # 3. If company is still empty, check for "About <Company>" or "<Company> is looking for"
    if not details["company"]:
        for line in lines[:20]:
            m_about = re.search(
                r"^about\s+([A-Z][A-Za-z0-9&.\s]{2,35})\b", line, re.IGNORECASE
            )
            if m_about:
                details["company"] = m_about.group(1).strip()
                break
            m_hiring = re.search(
                r"^([A-Z][A-Za-z0-9&.\s]{2,35})\s+is\s+(?:looking|hiring|seeking)", line
            )
            if m_hiring:
                details["company"] = m_hiring.group(1).strip()
                break

    # Clean up and normalize string lengths
    details["role"] = details["role"][:70].strip()
    details["company"] = details["company"][:60].strip()
    details["job_req_id"] = details["job_req_id"][:35].strip()
    return details


def failure_code(error: Exception) -> str:
    """Map a failure to a stable code the client translates; details stay in the log."""
    if isinstance(error, HTTPException):
        if error.status_code == 404:
            return "not_found"
        if error.status_code == 422:
            return "too_large"
    if isinstance(error, PromptSizeError):
        return "too_large"
    if isinstance(error, TimeoutError):
        return "timeout"
    return "failed"


class QueueManager:
    """Tailor queued job descriptions one at a time, oldest first, in the API process.

    The ``queue_items`` table is the queue: the worker claims the oldest pending
    row, so items survive restarts and a deleted row is never picked up. Every
    database step is its own short transaction, so no write reservation is held
    while the LLM runs.
    """

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._wake = asyncio.Event()

    async def start(self) -> None:
        """Start the worker; it first returns rows left ``processing`` to ``pending``."""
        if self._task is not None:
            return
        self._wake = asyncio.Event()
        self._wake.set()
        self._task = asyncio.create_task(self._run(), name="tailoring-queue")
        logger.info("Tailoring queue worker started.")

    async def stop(self) -> None:
        """Cancel the worker and wait for it to finish unwinding."""
        task, self._task = self._task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        logger.info("Tailoring queue worker stopped.")

    def notify(self) -> None:
        """Wake the worker after a new item was committed."""
        self._wake.set()

    async def _run(self) -> None:
        recovered = False
        while True:
            await self._wake.wait()
            self._wake.clear()
            try:
                if not recovered:
                    count = await db.requeue_interrupted_queue_items()
                    recovered = True
                    if count:
                        logger.info("Requeued %d interrupted tailoring item(s).", count)
                await self.drain()
            except Exception:
                logger.exception("Tailoring queue worker error; retrying shortly.")
                await asyncio.sleep(_RETRY_DELAY_SECONDS)
                self._wake.set()

    async def drain(self) -> None:
        """Process pending items until none is left, cooling down after each one."""
        while (item := await db.claim_next_queue_item()) is not None:
            await self._process_item(item)
            if item["rate_limit_seconds"] > 0:
                await self._cooldown(item["rate_limit_seconds"])

    async def _cooldown(self, seconds: float) -> None:
        logger.info("Tailoring queue cooldown: %ss before the next item.", seconds)
        await asyncio.sleep(seconds)

    async def _process_item(self, item: dict[str, Any]) -> None:
        """Tailor one claimed item and record the outcome on its row."""
        item_id = item["item_id"]
        try:
            tailored_resume = await self._tailor(item)
        except asyncio.CancelledError:
            # Shutdown: hand the item back so the next start resumes it.
            await self._requeue(item_id)
            raise
        except Exception as error:
            logger.exception("Tailoring queue item %s failed.", item_id)
            await self._record_outcome(
                item_id, {"status": "failed", "error": failure_code(error)}
            )
            return

        await self._record_outcome(
            item_id,
            {
                "status": "completed",
                "tailored_resume_id": tailored_resume["resume_id"],
                "title": tailored_resume.get("title"),
                "error": None,
            },
        )
        logger.info(
            "Tailoring queue item %s produced resume %s.",
            item_id,
            tailored_resume["resume_id"],
        )

    @staticmethod
    async def _record_outcome(item_id: str, updates: dict[str, Any]) -> None:
        """Write the final status, riding out brief database contention.

        A write that never lands leaves the row ``processing`` until the next
        start requeues it, so busy reservations are retried a few times.
        """
        for attempt in range(1, _FINAL_WRITE_ATTEMPTS + 1):
            try:
                await db.update_queue_item(item_id, updates)
                return
            except DatabaseBusyError:
                if attempt == _FINAL_WRITE_ATTEMPTS:
                    logger.exception(
                        "Could not record the outcome of queue item %s after %d "
                        "attempts; the next start recovers it.",
                        item_id,
                        attempt,
                    )
                    return
                await asyncio.sleep(_FINAL_WRITE_BACKOFF_SECONDS * attempt)

    async def _tailor(self, item: dict[str, Any]) -> dict[str, Any]:
        from app.routers import resumes

        job_id = item.get("job_id")
        if job_id:
            # An interrupted run may already have saved its resume; never tailor twice.
            improvement = await db.get_improvement_by_job(job_id)
            saved = (
                await db.get_resume(improvement["tailored_resume_id"])
                if improvement
                else None
            )
            if saved is not None:
                return saved
        else:
            job = await db.create_job(
                content=item["job_description"], resume_id=item["resume_id"]
            )
            job_id = job["job_id"]
            await db.update_queue_item(item["item_id"], {"job_id": job_id})
        # The same per-operation deadline AIOperationRoute gives POST /improve.
        async with operation_budget(settings.request_timeout_seconds):
            tailored_resume, *_ = await resumes.execute_tailoring_pipeline(
                resume_id=item["resume_id"],
                job_id=job_id,
                prompt_id=item.get("prompt_id"),
            )
        return tailored_resume

    @staticmethod
    async def _requeue(item_id: str) -> None:
        try:
            await db.update_queue_item(item_id, {"status": "pending"})
        except Exception:
            logger.exception(
                "Could not requeue interrupted item %s; the next start recovers it.",
                item_id,
            )


_RETRY_DELAY_SECONDS = 1.0
_FINAL_WRITE_ATTEMPTS = 4
_FINAL_WRITE_BACKOFF_SECONDS = 0.25

# Global singleton instance
queue_manager = QueueManager()
