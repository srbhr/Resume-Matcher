"""Live stage of long AI operations, readable by a client-chosen id.

The tailoring flow already records its stage in a plain dict; registering that
dict under the request's ``progress_id`` lets GET /resumes/improve/progress/{id}
stream the real stages while the POST is still running. Single-process state,
like the rest of the app's caches (one uvicorn worker).
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager

_REGISTRY: dict[str, dict[str, str]] = {}
_MAX_ENTRIES = 256
# A finished entry stays readable this long so a late subscriber sees "done".
_DONE_RETENTION_SECONDS = 30.0
# How long a subscriber waits for the POST to register its id.
_REGISTRATION_WAIT_SECONDS = 15.0
_POLL_SECONDS = 0.25


@contextmanager
def tracked_progress(progress_id: str | None, stage: str) -> Iterator[dict[str, str]]:
    """Yield the stage dict for one operation, registered when an id is given."""
    progress = {"stage": stage}
    if progress_id:
        while len(_REGISTRY) >= _MAX_ENTRIES:
            _REGISTRY.pop(next(iter(_REGISTRY)))
        _REGISTRY[progress_id] = progress
    try:
        yield progress
    finally:
        progress["done"] = "1"
        if progress_id:
            try:
                asyncio.get_running_loop().call_later(
                    _DONE_RETENTION_SECONDS, _forget, progress_id, progress
                )
            except RuntimeError:
                _forget(progress_id, progress)


def _forget(progress_id: str, progress: dict[str, str]) -> None:
    if _REGISTRY.get(progress_id) is progress:
        del _REGISTRY[progress_id]


async def progress_events(progress_id: str, max_seconds: float) -> AsyncIterator[str]:
    """Server-sent events: one ``data`` line per new stage, then ``done``."""
    deadline = time.monotonic() + max_seconds
    registration_deadline = time.monotonic() + _REGISTRATION_WAIT_SECONDS
    last_stage: str | None = None
    seen = False
    while time.monotonic() < deadline:
        entry = _REGISTRY.get(progress_id)
        if entry is None:
            if seen or time.monotonic() > registration_deadline:
                break
        else:
            seen = True
            stage = entry.get("stage", "")
            if stage != last_stage:
                last_stage = stage
                yield f"data: {json.dumps({'stage': stage})}\n\n"
            if entry.get("done"):
                break
        await asyncio.sleep(_POLL_SECONDS)
    yield "event: done\ndata: {}\n\n"
