"""Harness-steered bullet selection for tailoring from a long master resume.

The LLM only scores bullets (see bullet_scoring.py). Every include/drop
decision in this module is deterministic and unit-tested.
"""

import copy
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

logger = logging.getLogger(__name__)

SELECTABLE_SECTIONS: tuple[str, ...] = ("workExperience", "personalProjects")
MAX_FIT_RENDERS = 6

BulletKey = tuple[str, int, int]  # (section, entry_index, bullet_index)
PageFitStatus = Literal["fits", "trimmed", "over", "unavailable", "skipped"]


class PageMeasureError(Exception):
    """Raised by a page measurer when the draft cannot be rendered."""


@dataclass
class BulletSelection:
    data: dict[str, Any]
    scores: dict[BulletKey, float]
    bullets_before: int
    bullets_after: int


@dataclass
class FitResult:
    data: dict[str, Any]
    status: PageFitStatus
    trimmed: int
    pages: int | None
    renders: int


def bullet_path(section: str, entry_index: int, bullet_index: int) -> str:
    """Diff-style path for one bullet, e.g. workExperience[0].description[2]."""
    return f"{section}[{entry_index}].description[{bullet_index}]"


def _entries(
    data: dict[str, Any], section: str
) -> list[tuple[int, dict[str, Any], list[Any]]]:
    entries = data.get(section)
    if not isinstance(entries, list):
        return []
    found: list[tuple[int, dict[str, Any], list[Any]]] = []
    for entry_index, entry in enumerate(entries):
        if isinstance(entry, dict) and isinstance(entry.get("description"), list):
            found.append((entry_index, entry, entry["description"]))
    return found


def iter_bullet_rows(
    data: dict[str, Any],
) -> list[tuple[BulletKey, str, dict[str, Any]]]:
    """Every bullet in the selectable sections with its key, text and entry."""
    rows: list[tuple[BulletKey, str, dict[str, Any]]] = []
    for section in SELECTABLE_SECTIONS:
        for entry_index, entry, description in _entries(data, section):
            for bullet_index, row in enumerate(description):
                rows.append(((section, entry_index, bullet_index), str(row), entry))
    return rows


def count_bullets(data: dict[str, Any]) -> int:
    return len(iter_bullet_rows(data))


def _keep_rows(entry: dict[str, Any], keep: list[int]) -> None:
    rows = entry["description"]
    styles = entry.get("descriptionStyles")
    entry["description"] = [rows[i] for i in keep]
    if isinstance(styles, list):
        entry["descriptionStyles"] = [
            styles[i] if i < len(styles) else "bullet" for i in keep
        ]


def select_bullets(
    data: dict[str, Any],
    scores: dict[BulletKey, float],
    max_per_entry: int,
) -> BulletSelection:
    """Keep the top-N bullets per entry by (score desc, index asc), in original order."""
    result = copy.deepcopy(data)
    new_scores: dict[BulletKey, float] = {}
    before = 0
    after = 0
    for section in SELECTABLE_SECTIONS:
        for entry_index, entry, description in _entries(result, section):
            before += len(description)
            ranked = sorted(
                range(len(description)),
                key=lambda i: (-scores.get((section, entry_index, i), 0.0), i),
            )
            keep = sorted(ranked[:max_per_entry])
            if len(keep) < len(description):
                _keep_rows(entry, keep)
            for new_index, old_index in enumerate(keep):
                new_scores[(section, entry_index, new_index)] = scores.get(
                    (section, entry_index, old_index), 0.0
                )
            after += len(keep)
    return BulletSelection(result, new_scores, before, after)


def trim_order(data: dict[str, Any], scores: dict[BulletKey, float]) -> list[BulletKey]:
    """Deterministic drop sequence: least relevant entry first, never below 1 per entry."""
    counts: dict[tuple[str, int], int] = {}
    entry_scores: dict[tuple[str, int], list[float]] = {}
    candidates: list[tuple[int, str, int, int]] = []
    for section_rank, section in enumerate(SELECTABLE_SECTIONS):
        for entry_index, _entry, description in _entries(data, section):
            if not description:
                continue
            counts[(section, entry_index)] = len(description)
            entry_scores[(section, entry_index)] = [
                scores.get((section, entry_index, i), 0.0)
                for i in range(len(description))
            ]
            candidates.extend(
                (section_rank, section, entry_index, i) for i in range(len(description))
            )

    def key(candidate: tuple[int, str, int, int]) -> tuple[float, float, int, int, int]:
        section_rank, section, entry_index, bullet_index = candidate
        values = entry_scores[(section, entry_index)]
        relevance = sum(values) / len(values)
        return (
            relevance,
            values[bullet_index],
            -section_rank,
            -entry_index,
            -bullet_index,
        )

    order: list[BulletKey] = []
    for _rank, section, entry_index, bullet_index in sorted(candidates, key=key):
        if counts[(section, entry_index)] > 1:
            counts[(section, entry_index)] -= 1
            order.append((section, entry_index, bullet_index))
    return order


def drop_bullets(data: dict[str, Any], drops: list[BulletKey]) -> dict[str, Any]:
    """Return a copy without the given bullets (keys index into ``data``)."""
    result = copy.deepcopy(data)
    dropped: dict[tuple[str, int], set[int]] = {}
    for section, entry_index, bullet_index in drops:
        dropped.setdefault((section, entry_index), set()).add(bullet_index)
    for (section, entry_index), indices in dropped.items():
        entry = result[section][entry_index]
        keep = [i for i in range(len(entry["description"])) if i not in indices]
        _keep_rows(entry, keep)
    return result


async def fit_to_one_page(
    data: dict[str, Any],
    scores: dict[BulletKey, float],
    measure: Callable[[dict[str, Any]], Awaitable[int]],
    max_renders: int = MAX_FIT_RENDERS,
) -> FitResult:
    """Drop the fewest ranked bullets so the rendered draft fits one page.

    Page count is monotonic in the number of drops, so binary search over k.
    """
    order = trim_order(data, scores)
    renders = 0

    async def pages_for(k: int) -> int:
        nonlocal renders
        renders += 1
        return await measure(drop_bullets(data, order[:k]))

    try:
        base_pages = await pages_for(0)
        if base_pages <= 1:
            return FitResult(copy.deepcopy(data), "fits", 0, base_pages, renders)
        if not order:
            return FitResult(copy.deepcopy(data), "over", 0, base_pages, renders)
        top = len(order)
        top_pages = await pages_for(top)
        if top_pages > 1:
            return FitResult(drop_bullets(data, order), "over", top, top_pages, renders)
        low, high, high_pages = 0, top, top_pages
        try:
            while high - low > 1 and renders < max_renders:
                mid = (low + high) // 2
                mid_pages = await pages_for(mid)
                if mid_pages <= 1:
                    high, high_pages = mid, mid_pages
                else:
                    low = mid
        except PageMeasureError as e:
            # A fitting trim is already known; keep the smallest one measured.
            logger.warning(
                "Page fit search stopped early; keeping trim %d: %s", high, e
            )
        return FitResult(
            drop_bullets(data, order[:high]), "trimmed", high, high_pages, renders
        )
    except PageMeasureError as e:
        logger.warning("Page fit skipped; draft could not be measured: %s", e)
        return FitResult(copy.deepcopy(data), "unavailable", 0, None, renders)
