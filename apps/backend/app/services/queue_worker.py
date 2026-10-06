"""Background queue worker for sequential resume tailoring with rate limiting and metadata extraction."""

import asyncio
import logging
import re
from typing import Any

from app.database import db

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
            w in first_line.lower() for w in ["about us", "overview", "description", "welcome"]
        ):
            details["role"] = first_line

    # 3. If company is still empty, check for "About <Company>" or "<Company> is looking for"
    if not details["company"]:
        for line in lines[:20]:
            m_about = re.search(r"^about\s+([A-Z][A-Za-z0-9&.\s]{2,35})\b", line, re.IGNORECASE)
            if m_about:
                details["company"] = m_about.group(1).strip()
                break
            m_hiring = re.search(r"^([A-Z][A-Za-z0-9&.\s]{2,35})\s+is\s+(?:looking|hiring|seeking)", line)
            if m_hiring:
                details["company"] = m_hiring.group(1).strip()
                break

    # Clean up and normalize string lengths
    details["role"] = details["role"][:70].strip()
    details["company"] = details["company"][:60].strip()
    details["job_req_id"] = details["job_req_id"][:35].strip()
    return details


class QueueManager:
    """Manages sequential execution of queued resume tailoring with rate limiting."""

    def __init__(self):
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None
        self._shutdown_event = asyncio.Event()

    async def start(self):
        """Start the background worker task."""
        self._shutdown_event.clear()
        self._worker_task = asyncio.create_task(self._worker_loop())
        await self._recover_pending_items()
        logger.info("QueueManager background worker started.")

    async def stop(self):
        """Gracefully stop the background worker."""
        self._shutdown_event.set()
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None
        logger.info("QueueManager background worker stopped.")

    async def enqueue_item(self, item_id: str):
        """Enqueue an individual job item for background tailoring."""
        await self._queue.put(item_id)

    async def enqueue_batch(self, batch_id: str):
        """Enqueue items in a batch for backward compatibility."""
        items = db.get_batch_items(batch_id)
        for item in items:
            await self._queue.put(item["item_id"])

    async def _recover_pending_items(self):
        """Recover items that were queued or in-progress before server restart."""
        try:
            pending_items = [
                it
                for it in db.get_queue(limit=100)
                if it.get("status") in ("pending", "processing")
            ]
            for item in reversed(pending_items):
                item_id = item["item_id"]
                # Reset stuck processing items back to pending
                if item.get("status") == "processing":
                    db.update_queue_item(item_id, {"status": "pending"})
                await self._queue.put(item_id)
                logger.info("Recovered queued tailoring item: %s", item_id)
        except Exception as e:
            logger.error("Failed to recover pending queue items: %s", e)

    async def _worker_loop(self):
        """Worker loop that dequeues and processes items sequentially."""
        from app.routers.resumes import execute_tailoring_pipeline

        while not self._shutdown_event.is_set():
            try:
                item_id = await self._queue.get()
            except asyncio.CancelledError:
                break

            try:
                await self._process_item(item_id, execute_tailoring_pipeline)
            except Exception as e:
                logger.error("Error processing queue item %s: %s", item_id, e, exc_info=True)
            finally:
                self._queue.task_done()

    async def _process_item(self, item_id: str, execute_tailoring_fn):
        """Process an individual queued job with cooldown rate-limiting."""
        item = db.get_queue_item(item_id)
        if not item:
            # Check if this item is in the batch_items table (backward compatibility)
            ItemQuery = db.batch_items
            results = ItemQuery.search(db.batch_items.table.Query().item_id == item_id) if hasattr(ItemQuery, "table") else None
            return

        # Skip if already completed or deleted
        if item.get("status") in ("completed", "cancelled"):
            return

        db.update_queue_item(item_id, {"status": "processing"})
        resume_id = item["resume_id"]
        rate_limit_seconds = float(item.get("rate_limit_seconds", 5.0))
        prompt_id = item.get("prompt_id")

        try:
            # 1. Create Job in database if needed
            job_id = item.get("job_id")
            if not job_id:
                job = await db.create_job(
                    content=item["job_description"].strip(),
                    resume_id=resume_id,
                )
                job_id = job["job_id"]
                db.update_queue_item(item_id, {"job_id": job_id})

            # 2. Run tailoring pipeline
            (
                tailored_resume,
                improved_data,
                improvements,
                request_id,
                extra_meta,
            ) = await execute_tailoring_fn(
                resume_id=resume_id,
                job_id=job_id,
                prompt_id=prompt_id,
            )

            tailored_resume_id = tailored_resume["resume_id"]
            final_title = (
                tailored_resume.get("title")
                or extra_meta.get("title")
                or item.get("role")
                or "Tailored Resume"
            )

            db.update_queue_item(
                item_id,
                {
                    "status": "completed",
                    "tailored_resume_id": tailored_resume_id,
                    "title": final_title,
                    "error": None,
                },
            )
            logger.info(
                "Queue item %s: successfully generated resume %s (%s)",
                item_id,
                tailored_resume_id,
                final_title,
            )

        except Exception as err:
            logger.error("Queue item %s tailoring failed: %s", item_id, err, exc_info=True)
            db.update_queue_item(
                item_id,
                {
                    "status": "failed",
                    "error": str(err),
                },
            )

        # Apply rate limiting cooldown
        if rate_limit_seconds > 0 and not self._shutdown_event.is_set():
            logger.info(
                "Rate limit cooldown: sleeping %s seconds before next queue item...",
                rate_limit_seconds,
            )
            await asyncio.sleep(rate_limit_seconds)


# Global singleton instances
queue_manager = QueueManager()
batch_manager = queue_manager  # Alias for backward compatibility

