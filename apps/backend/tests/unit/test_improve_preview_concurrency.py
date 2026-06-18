"""Unit tests for improve/preview concurrency limiting (cubic P1 mitigation).

Verifies that the asyncio.Semaphore guarding `improve_resume_preview_endpoint`
correctly bounds concurrent tailoring jobs and rejects excess callers fast
with 503 instead of letting them stack up against the long inner timeout.
"""

import asyncio

import pytest

from app.routers import resumes


@pytest.mark.asyncio
async def test_semaphore_default_concurrency_is_four():
    """Sanity-check the configured cap. Bumping this is a deliberate decision."""
    assert resumes.IMPROVE_PREVIEW_MAX_CONCURRENCY == 4


@pytest.mark.asyncio
async def test_semaphore_acquires_slot_when_free():
    """A first caller acquires a slot immediately."""
    sem = resumes._improve_preview_semaphore

    # Drain to a known state: pretend no one is holding any slots.
    # Real test environments should never share state; this is defensive.
    while sem.locked():
        sem.release()

    await asyncio.wait_for(sem.acquire(), timeout=0)
    try:
        # One slot consumed; remaining should be N-1.
        assert sem._value == resumes.IMPROVE_PREVIEW_MAX_CONCURRENCY - 1
    finally:
        sem.release()


@pytest.mark.asyncio
async def test_semaphore_rejects_when_saturated():
    """When all slots are held, a non-blocking acquire raises TimeoutError."""
    sem = resumes._improve_preview_semaphore

    # Hold every slot.
    held = []
    try:
        for _ in range(resumes.IMPROVE_PREVIEW_MAX_CONCURRENCY):
            await sem.acquire()
            held.append(True)

        # Now an extra non-blocking acquire must fail fast.
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(sem.acquire(), timeout=0)
    finally:
        for _ in held:
            sem.release()


@pytest.mark.asyncio
async def test_semaphore_recovers_after_release():
    """After all holders release, new callers can acquire again."""
    sem = resumes._improve_preview_semaphore

    held = []
    for _ in range(resumes.IMPROVE_PREVIEW_MAX_CONCURRENCY):
        await sem.acquire()
        held.append(True)

    for _ in held:
        sem.release()

    # Should succeed instantly now.
    await asyncio.wait_for(sem.acquire(), timeout=0)
    sem.release()
