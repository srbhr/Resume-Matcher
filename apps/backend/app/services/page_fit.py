"""Render an unsaved resume draft through the real print pipeline to count pages."""

import io
import logging
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

from pdfminer.pdfpage import PDFPage

from app.ai_budget import AIOperationDeadlineExceeded
from app.config import settings
from app.pdf import PRINT_ERROR_SELECTOR, render_resume_pdf
from app.schemas.models import PageFitSettings
from app.services.bullet_selector import PageMeasureError

logger = logging.getLogger(__name__)


class RenderDraftStore:
    """Short-lived in-memory drafts the print route can fetch by token."""

    def __init__(
        self,
        ttl_seconds: float = 120.0,
        max_entries: int = 32,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl = ttl_seconds
        self._max = max_entries
        self._clock = clock
        self._items: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()

    def _evict(self) -> None:
        now = self._clock()
        for token in [t for t, (exp, _) in self._items.items() if exp <= now]:
            del self._items[token]
        while len(self._items) > self._max:
            self._items.popitem(last=False)

    def put(self, data: dict[str, Any]) -> str:
        token = uuid4().hex
        self._items[token] = (self._clock() + self._ttl, data)
        self._evict()
        return token

    def get(self, token: str) -> dict[str, Any] | None:
        self._evict()
        item = self._items.get(token)
        return item[1] if item else None

    def discard(self, token: str) -> None:
        self._items.pop(token, None)


render_drafts = RenderDraftStore()


def count_pdf_pages(pdf_bytes: bytes) -> int:
    return len(list(PDFPage.get_pages(io.BytesIO(pdf_bytes))))


async def measure_page_count(data: dict[str, Any], fit: PageFitSettings) -> int:
    """Render ``data`` with the user's print settings and return its page count."""
    token = render_drafts.put(data)
    try:
        query = urlencode(fit.to_query())
        url = f"{settings.frontend_base_url}/print/resumes/draft?draft={token}&{query}"
        margins = {
            "top": fit.marginTop,
            "right": fit.marginRight,
            "bottom": fit.marginBottom,
            "left": fit.marginLeft,
        }
        # Also wait for the print route's error marker so a missing draft fails fast.
        pdf_bytes = await render_resume_pdf(
            url,
            fit.pageSize,
            selector=f".resume-print, {PRINT_ERROR_SELECTOR}",
            margins=margins,
        )
        return count_pdf_pages(pdf_bytes)
    except AIOperationDeadlineExceeded:
        raise
    except Exception as e:
        logger.warning("Draft page measurement failed: %s", e)
        raise PageMeasureError("Draft could not be rendered") from e
    finally:
        render_drafts.discard(token)
