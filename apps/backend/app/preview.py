"""Durable preview identity and input-version contracts."""

import hashlib
import json
from dataclasses import dataclass
from typing import Any


class PreviewValidationError(ValueError):
    """The request does not match a registered preview."""


class PreviewConflictError(ValueError):
    """The preview is stale, expired, deleted, or owned by another confirmer."""


class PreviewBusyError(PreviewConflictError):
    """Another request currently owns this confirmation."""


@dataclass(frozen=True)
class PreviewClaim:
    preview_id: str
    token: str | None = None
    response: dict[str, Any] | None = None
    improvements: list[dict[str, Any]] | None = None


def resume_fingerprint(
    content: str,
    processed_data: dict[str, Any] | None,
    original_markdown: str | None,
) -> str:
    serialized = json.dumps(
        [content, processed_data, original_markdown],
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def job_fingerprint(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
