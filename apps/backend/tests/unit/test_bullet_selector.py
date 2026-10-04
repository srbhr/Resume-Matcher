"""Deterministic harness decisions: which bullets survive, which get trimmed."""

import pytest

from app.services.bullet_selector import (
    PageMeasureError,
    count_bullets,
    drop_bullets,
    fit_to_one_page,
    select_bullets,
    trim_order,
)


def _resume() -> dict:
    return {
        "personalInfo": {"name": "A"},
        "workExperience": [
            {
                "title": "DevRel",
                "company": "X",
                "description": [f"x{i}" for i in range(6)],
                "descriptionStyles": ["bullet"] * 6,
            },
            {
                "title": "SWE",
                "company": "Y",
                "description": ["y0", "y1"],
                "descriptionStyles": ["bullet", "plain"],
            },
        ],
        "personalProjects": [{"name": "P", "description": ["p0", "p1", "p2", "p3"]}],
        "education": [{"institution": "U", "description": "kept as is"}],
    }


SCORES = {
    ("workExperience", 0, 0): 10,
    ("workExperience", 0, 1): 90,
    ("workExperience", 0, 2): 50,
    ("workExperience", 0, 3): 90,
    ("workExperience", 0, 4): 5,
    ("workExperience", 0, 5): 70,
    ("workExperience", 1, 0): 40,
    ("workExperience", 1, 1): 30,
    ("personalProjects", 0, 0): 1,
    ("personalProjects", 0, 1): 2,
    ("personalProjects", 0, 2): 3,
    ("personalProjects", 0, 3): 4,
}


def test_select_keeps_top_n_in_original_order_with_styles() -> None:
    sel = select_bullets(_resume(), SCORES, 3)
    exp = sel.data["workExperience"][0]
    assert exp["description"] == ["x1", "x3", "x5"]  # top-3 by score, original order
    assert exp["descriptionStyles"] == ["bullet"] * 3
    assert sel.data["workExperience"][1]["description"] == ["y0", "y1"]
    assert sel.data["personalProjects"][0]["description"] == ["p1", "p2", "p3"]
    assert sel.data["education"] == _resume()["education"]
    assert (sel.bullets_before, sel.bullets_after) == (12, 8)
    assert sel.scores[("workExperience", 0, 0)] == 90  # re-keyed to condensed indices


def test_select_breaks_score_ties_by_earlier_index() -> None:
    sel = select_bullets(_resume(), {}, 2)  # all scores 0
    assert sel.data["workExperience"][0]["description"] == ["x0", "x1"]


def test_select_is_noop_under_cap() -> None:
    data = _resume()
    sel = select_bullets(data, SCORES, 10)
    assert sel.data == data
    assert sel.data is not data  # never mutates input


def test_select_handles_misaligned_styles_and_empty_rows() -> None:
    data = {
        "workExperience": [
            {"description": ["a", "", "c", "d"], "descriptionStyles": ["plain"]},
            {"description": []},
            {"title": "no description key"},
        ]
    }
    sel = select_bullets(
        data, {("workExperience", 0, 3): 99, ("workExperience", 0, 0): 50}, 2
    )
    entry = sel.data["workExperience"][0]
    assert entry["description"] == ["a", "d"]
    assert entry["descriptionStyles"] == ["plain", "bullet"]
    assert sel.data["workExperience"][1]["description"] == []


def test_trim_order_drops_least_relevant_entry_first_and_keeps_one_per_entry() -> None:
    sel = select_bullets(_resume(), SCORES, 3)
    order = trim_order(sel.data, sel.scores)
    # Projects entry has the lowest mean relevance -> its bullets go first (lowest score first).
    assert order[:2] == [("personalProjects", 0, 0), ("personalProjects", 0, 1)]
    remaining = drop_bullets(sel.data, order)
    for section in ("workExperience", "personalProjects"):
        for entry in remaining[section]:
            assert len(entry["description"]) == 1
    assert count_bullets(remaining) == 3


def test_drop_bullets_keeps_styles_aligned() -> None:
    sel = select_bullets(_resume(), SCORES, 3)
    out = drop_bullets(sel.data, [("workExperience", 1, 0)])
    assert out["workExperience"][1]["description"] == ["y1"]
    assert out["workExperience"][1]["descriptionStyles"] == ["plain"]


async def test_fit_returns_untouched_when_first_render_fits() -> None:
    sel = select_bullets(_resume(), SCORES, 3)
    calls = []

    async def measure(d: dict) -> int:
        calls.append(count_bullets(d))
        return 1

    result = await fit_to_one_page(sel.data, sel.scores, measure)
    assert (result.status, result.trimmed, result.renders) == ("fits", 0, 1)
    assert calls == [8]


async def test_fit_binary_searches_smallest_trim_that_fits() -> None:
    sel = select_bullets(_resume(), SCORES, 3)

    async def measure(d: dict) -> int:
        return 1 if count_bullets(d) <= 5 else 2  # need to drop 3 of 8

    result = await fit_to_one_page(sel.data, sel.scores, measure)
    assert result.status == "trimmed"
    assert result.trimmed == 3
    assert count_bullets(result.data) == 5
    assert result.renders <= 6


async def test_fit_reports_over_when_even_max_trim_spills() -> None:
    sel = select_bullets(_resume(), SCORES, 3)

    async def measure(d: dict) -> int:
        return 2

    result = await fit_to_one_page(sel.data, sel.scores, measure)
    assert result.status == "over"
    assert count_bullets(result.data) == 3  # min one bullet per entry


async def test_fit_reports_unavailable_when_renderer_fails() -> None:
    sel = select_bullets(_resume(), SCORES, 3)

    async def measure(d: dict) -> int:
        raise PageMeasureError("no chromium")

    result = await fit_to_one_page(sel.data, sel.scores, measure)
    assert (result.status, result.trimmed) == ("unavailable", 0)
    assert result.data == sel.data


async def test_fit_respects_render_cap() -> None:
    sel = select_bullets(_resume(), SCORES, 3)
    renders = 0

    async def measure(d: dict) -> int:
        nonlocal renders
        renders += 1
        return 1 if count_bullets(d) <= 4 else 2

    result = await fit_to_one_page(sel.data, sel.scores, measure, max_renders=3)
    assert renders == 3
    assert result.status == "trimmed"
    assert count_bullets(result.data) <= 4  # smallest KNOWN fitting k, may over-trim


@pytest.mark.parametrize(
    ("fits_up_to", "failing_render", "known_fit_k"),
    [
        (5, 3, 5),  # base and max trim measured; the first bisection render fails
        (6, 4, 2),  # bisection already found k=2 fits; the next render fails
    ],
)
async def test_fit_keeps_known_fitting_trim_when_renderer_fails_mid_search(
    fits_up_to: int, failing_render: int, known_fit_k: int
) -> None:
    sel = select_bullets(_resume(), SCORES, 3)  # 8 bullets, 5 droppable
    renders = 0

    async def measure(d: dict) -> int:
        nonlocal renders
        renders += 1
        if renders == failing_render:
            raise PageMeasureError("render timed out")
        return 1 if count_bullets(d) <= fits_up_to else 2

    result = await fit_to_one_page(sel.data, sel.scores, measure)
    order = trim_order(sel.data, sel.scores)
    assert (result.status, result.trimmed, result.pages) == ("trimmed", known_fit_k, 1)
    assert result.renders == failing_render
    assert result.data == drop_bullets(sel.data, order[:known_fit_k])
    assert count_bullets(result.data) == 8 - known_fit_k  # the smallest fit measured
