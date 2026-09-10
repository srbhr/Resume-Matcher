"""Elapsed stage records retained on success, error and cancellation."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from time import monotonic
from typing import Any


@contextmanager
def measured_step(
    steps: list[dict[str, Any]],
    stage: str,
    *,
    on_error: Callable[[str, BaseException], None] | None = None,
) -> Iterator[dict[str, Any]]:
    record: dict[str, Any] = {"stage": stage, "ok": False}
    started = monotonic()
    try:
        yield record
        record["ok"] = True
    except BaseException as exc:
        record["error"] = type(exc).__name__
        record["cancelled"] = not isinstance(exc, Exception)
        if on_error is not None:
            try:
                on_error(stage, exc)
            except Exception as diagnostic_error:  # noqa: BLE001
                # A diagnostic sink failure must not replace the monitored failure.
                record["diagnostic_error"] = type(diagnostic_error).__name__
        raise
    finally:
        record["ms"] = round((monotonic() - started) * 1000, 3)
        steps.append(record)
