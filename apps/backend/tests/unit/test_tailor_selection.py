"""Orchestration tests for harness bullet selection (collaborators patched)."""

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.ai_budget import AIOperationDeadlineExceeded, operation_budget
from app.schemas.models import PageFitSettings
from app.services import tailor_selection
from app.services.bullet_selector import PageMeasureError

DATA = {
    "workExperience": [
        {"title": "E", "company": "X", "description": ["a", "b", "c", "d", "e"]}
    ]
}
SCORES = {
    ("workExperience", 0, i): float(s) for i, s in enumerate([10, 50, 40, 90, 20])
}


async def test_selection_without_page_fit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        tailor_selection, "score_bullets", AsyncMock(return_value=(SCORES, "llm"))
    )
    measure = AsyncMock()
    monkeypatch.setattr(tailor_selection, "measure_page_count", measure)
    out = await tailor_selection.run_bullet_selection(
        source_data=DATA,
        job_description="JD",
        job_keywords={},
        max_per_entry=3,
        page_fit=None,
    )
    assert out.data["workExperience"][0]["description"] == ["b", "c", "d"]
    assert out.summary.page_fit == "skipped" and out.summary.bullets_before == 5
    assert out.summary.bullets_after == 3 and out.warnings == []
    measure.assert_not_called()


async def test_selection_with_page_fit_trims_and_warns_on_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        tailor_selection,
        "score_bullets",
        AsyncMock(return_value=(SCORES, "keyword_fallback")),
    )

    async def measure(data: dict[str, Any], fit: PageFitSettings) -> int:
        return 1 if len(data["workExperience"][0]["description"]) <= 2 else 2

    monkeypatch.setattr(tailor_selection, "measure_page_count", measure)
    out = await tailor_selection.run_bullet_selection(
        source_data=DATA,
        job_description="JD",
        job_keywords={},
        max_per_entry=3,
        page_fit=PageFitSettings(),
    )
    assert out.data["workExperience"][0]["description"] == ["b", "d"]  # dropped c (40)
    assert out.summary.page_fit == "trimmed" and out.summary.trimmed_for_fit == 1
    assert tailor_selection.BULLET_SCORING_FALLBACK_WARNING in out.warnings


async def test_final_page_check_swallows_render_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        tailor_selection,
        "measure_page_count",
        AsyncMock(side_effect=PageMeasureError("x")),
    )
    assert await tailor_selection.final_page_check(DATA, PageFitSettings()) is None


def _deadline_exceeded() -> float:
    raise AIOperationDeadlineExceeded("AI operation deadline exceeded")


def _reserve_only() -> float:
    return float(tailor_selection.FINAL_CHECK_RESERVE_SECONDS)


@pytest.mark.parametrize("remaining", [_deadline_exceeded, _reserve_only])
async def test_final_page_check_skips_render_without_budget(
    monkeypatch: pytest.MonkeyPatch, remaining: Any
) -> None:
    measure = AsyncMock(return_value=2)
    monkeypatch.setattr(tailor_selection, "measure_page_count", measure)
    monkeypatch.setattr(tailor_selection, "remaining_timeout", remaining, raising=False)
    assert await tailor_selection.final_page_check(DATA, PageFitSettings()) is None
    measure.assert_not_called()


async def _final_check(data: dict[str, Any]) -> Any:
    return await tailor_selection.final_page_check(data, PageFitSettings())


async def _selection_with_fit(data: dict[str, Any]) -> Any:
    return await tailor_selection.run_bullet_selection(
        source_data=data,
        job_description="JD",
        job_keywords={},
        max_per_entry=3,
        page_fit=PageFitSettings(),
    )


@pytest.mark.parametrize("stage", [_final_check, _selection_with_fit])
async def test_operation_deadline_during_a_render_is_not_a_slow_render(
    monkeypatch: pytest.MonkeyPatch, stage: Any
) -> None:
    """AIOperationDeadlineExceeded subclasses TimeoutError but must end the operation."""
    monkeypatch.setattr(
        tailor_selection, "score_bullets", AsyncMock(return_value=(SCORES, "llm"))
    )
    monkeypatch.setattr(
        tailor_selection,
        "measure_page_count",
        AsyncMock(
            side_effect=AIOperationDeadlineExceeded("AI operation deadline exceeded")
        ),
    )
    with pytest.raises(AIOperationDeadlineExceeded):
        await stage(DATA)


@pytest.mark.parametrize(
    ("remaining", "render_cost", "expected_renders", "expected_status"),
    [
        (1000.0, 1.0, [3, 1, 2], "trimmed"),  # quick renders never reach the cap
        (200.0, 25.0, [3, 1], "trimmed"),  # 25% share binds: cap 50 s, not 60 s
        (1000.0, 35.0, [3, 1], "trimmed"),  # 60 s ceiling binds, not 25% (250 s)
        (40.0, 30.0, [3], "unavailable"),  # cap 10 s is gone after the first render
    ],
)
async def test_page_fit_stops_rendering_once_its_time_cap_is_spent(
    monkeypatch: pytest.MonkeyPatch,
    remaining: float,
    render_cost: float,
    expected_renders: list[int],
    expected_status: str,
) -> None:
    """R13: fitting renders for at most min(60 s, 25% of the remaining budget)."""
    monkeypatch.setattr(
        tailor_selection, "score_bullets", AsyncMock(return_value=(SCORES, "llm"))
    )
    now = [1000.0]
    monkeypatch.setattr(tailor_selection, "monotonic", lambda: now[0], raising=False)
    monkeypatch.setattr(tailor_selection, "remaining_timeout", lambda: remaining)
    renders: list[int] = []

    async def measure(data: dict[str, Any], fit: PageFitSettings) -> int:
        bullets = len(data["workExperience"][0]["description"])
        renders.append(bullets)
        now[0] += render_cost
        return 1 if bullets <= 1 else 2

    monkeypatch.setattr(tailor_selection, "measure_page_count", measure)
    out = await tailor_selection.run_bullet_selection(
        source_data=DATA,
        job_description="JD",
        job_keywords={},
        max_per_entry=3,
        page_fit=PageFitSettings(),
    )
    assert renders == expected_renders
    assert out.summary.page_fit == expected_status
    if expected_status == "trimmed":
        # The smallest known-fitting trim is kept when the cap stops the search.
        assert out.data["workExperience"][0]["description"] == ["d"]
    else:
        assert out.data["workExperience"][0]["description"] == ["b", "c", "d"]


async def _slow_render(data: dict[str, Any], fit: PageFitSettings) -> int:
    await asyncio.sleep(5)
    return 2


async def test_final_page_check_gives_up_when_render_outlives_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(tailor_selection, "measure_page_count", _slow_render)
    loop = asyncio.get_running_loop()
    started = loop.time()
    async with operation_budget(tailor_selection.FINAL_CHECK_RESERVE_SECONDS + 0.05):
        result = await tailor_selection.final_page_check(DATA, PageFitSettings())
    assert result is None
    assert loop.time() - started < 1  # cut at the budget, not the 5 s render


async def test_page_fit_degrades_when_render_outlives_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        tailor_selection, "score_bullets", AsyncMock(return_value=(SCORES, "llm"))
    )
    monkeypatch.setattr(tailor_selection, "measure_page_count", _slow_render)
    async with operation_budget(tailor_selection.FINAL_CHECK_RESERVE_SECONDS + 0.05):
        out = await tailor_selection.run_bullet_selection(
            source_data=DATA,
            job_description="JD",
            job_keywords={},
            max_per_entry=3,
            page_fit=PageFitSettings(),
        )
    assert out.summary.page_fit == "unavailable" and out.summary.final_pages is None
    assert out.data["workExperience"][0]["description"] == ["b", "c", "d"]
    assert tailor_selection.PAGE_FIT_UNAVAILABLE_WARNING in out.warnings
