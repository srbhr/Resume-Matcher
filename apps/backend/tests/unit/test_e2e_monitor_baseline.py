"""Offline tests for baseline diffing (the regression detector)."""

from __future__ import annotations

from e2e_monitor.baseline import diff_against_baseline, summary_to_baseline

_BASELINE = {
    "variations": {
        "backend-eng": {"jd_keyword_coverage": 1.0, "judge_score": 4, "non_blank": True},
    },
    "floor": {"min_judge_score": 3, "min_keyword_coverage": 0.8},
    "judge_tolerance": 1,
}


def test_diff_clean_when_within_tolerance() -> None:
    current = {"backend-eng": {"jd_keyword_coverage": 1.0, "judge_score": 4, "non_blank": True}}
    d = diff_against_baseline(current, _BASELINE)
    assert d["regressed"] is False
    assert d["regressions"] == []


def test_diff_flags_judge_missing_when_judge_failed() -> None:
    # judge_score None = the judge errored for this variation; the baseline had a
    # score, so a now-missing score is a regression (worse than any low score).
    current = {"backend-eng": {"jd_keyword_coverage": 1.0, "judge_score": None, "non_blank": True}}
    d = diff_against_baseline(current, _BASELINE)
    assert any(
        r["kind"] == "judge_missing" and r.get("baseline_value") == 4
        for r in d["regressions"]
    )
    assert d["regressed"] is True


def test_diff_flags_floor_breach() -> None:
    current = {"backend-eng": {"jd_keyword_coverage": 0.5, "judge_score": 2, "non_blank": False}}
    d = diff_against_baseline(current, _BASELINE)
    assert d["regressed"] is True
    kinds = {r["kind"] for r in d["regressions"]}
    assert {"keyword_floor", "judge_floor", "blank_render"} <= kinds


def test_diff_flags_drop_beyond_tolerance_even_above_floor() -> None:
    # judge 4 -> 3 is within tolerance(1); 4 -> 2 is beyond AND a floor breach.
    current = {"backend-eng": {"jd_keyword_coverage": 1.0, "judge_score": 2, "non_blank": True}}
    d = diff_against_baseline(current, _BASELINE)
    assert any(r["kind"] == "judge_drop" for r in d["regressions"])


def test_diff_flags_missing_variation() -> None:
    baseline = {
        "variations": {
            "backend-eng": {"jd_keyword_coverage": 1.0, "judge_score": 4, "non_blank": True},
            "ml-eng": {"jd_keyword_coverage": 0.8, "judge_score": 3, "non_blank": True},
        },
        "floor": {"min_judge_score": 2, "min_keyword_coverage": 0.5},
        "judge_tolerance": 1,
    }
    current = {"backend-eng": {"jd_keyword_coverage": 1.0, "judge_score": 4, "non_blank": True}}
    d = diff_against_baseline(current, baseline)
    assert d["regressed"] is True
    assert any(r["kind"] == "missing_variation" and r["jd_key"] == "ml-eng" for r in d["regressions"])


def test_summary_to_baseline_roundtrips_shape() -> None:
    variations = [{"jd_key": "backend-eng", "scores": {"jd_keyword_coverage": 1.0},
                   "judge": {"score": 4}, "render": {"non_blank": True}}]
    b = summary_to_baseline(variations)
    assert b["variations"]["backend-eng"]["judge_score"] == 4
