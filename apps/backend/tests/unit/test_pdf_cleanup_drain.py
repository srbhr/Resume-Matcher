"""The test harness lets PDF browser teardown finish before a test's loop closes.

See ``tests/conftest.py::drain_pdf_cleanup``: teardown still running when the loop
closes leaves Playwright waiting forever for a reply, which hung xdist workers.
"""

import asyncio

import pytest

from app import pdf
from tests.conftest import drain_pdf_cleanup


async def test_waits_for_teardown_running_on_this_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    finished = asyncio.Event()

    async def slow_teardown() -> None:
        await asyncio.sleep(0.05)
        finished.set()

    owner = asyncio.create_task(slow_teardown())
    monkeypatch.setattr(pdf, "_background_owners", {owner})

    await drain_pdf_cleanup()

    assert finished.is_set()
