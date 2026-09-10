"""Explicit source and request limits; oversized input is rejected, not cut."""

import json
from typing import Any

from fastapi import HTTPException

MAX_SOURCE_CHARACTERS = 200_000
MAX_JOB_CHARACTERS = 100_000
MAX_PROMPT_CHARACTERS = 512_000
MAX_ITEM_WORKERS = 4


class PromptSizeError(ValueError):
    """A rendered provider prompt exceeds the supported request size."""


def validate_prompt_size(value: str) -> None:
    """Reject a rendered prompt with a client-actionable exception type."""
    if len(value) > MAX_PROMPT_CHARACTERS:
        raise PromptSizeError(
            f"AI prompt exceeds the {MAX_PROMPT_CHARACTERS}-character limit"
        )


def validate_source_size(value: Any, limit: int = MAX_SOURCE_CHARACTERS) -> None:
    """Validate JSON/text source size for schemas and service boundaries."""
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    if len(text) > limit:
        raise ValueError(f"AI source exceeds the {limit}-character limit")


def require_source_size(value: Any, limit: int = MAX_SOURCE_CHARACTERS) -> None:
    """Reject oversized stored input before starting an AI stage."""
    try:
        validate_source_size(value, limit)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
