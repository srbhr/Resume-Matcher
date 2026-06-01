"""Baseline diff (regression detector) + baseline construction.

An absolute ``floor`` is the hard fail; on top, a per-metric drop beyond
``judge_tolerance`` flags drift even while still above the floor.
"""

from __future__ import annotations

from typing import Any


def diff_against_baseline(
    current: dict[str, dict[str, Any]], baseline: dict[str, Any]
) -> dict[str, Any]:
    """Compare this run's per-variation metrics against the committed baseline."""
    floor = baseline.get("floor", {})
    tol = baseline.get("judge_tolerance", 1)
    base_vars = baseline.get("variations", {})
    regressions: list[dict[str, Any]] = []

    for jd_key, cur in current.items():
        base = base_vars.get(jd_key, {})
        cov = cur.get("jd_keyword_coverage")
        judge = cur.get("judge_score")
        non_blank = cur.get("non_blank")

        if cov is not None and cov < floor.get("min_keyword_coverage", 0.0):
            regressions.append({"jd_key": jd_key, "kind": "keyword_floor", "value": cov})
        if judge is not None and judge < floor.get("min_judge_score", 0):
            regressions.append({"jd_key": jd_key, "kind": "judge_floor", "value": judge})
        if non_blank is False:
            regressions.append({"jd_key": jd_key, "kind": "blank_render", "value": False})
        base_judge = base.get("judge_score")
        if judge is not None and base_judge is not None and (base_judge - judge) > tol:
            regressions.append(
                {"jd_key": jd_key, "kind": "judge_drop", "from": base_judge, "to": judge}
            )

    return {"regressed": bool(regressions), "regressions": regressions}


def summary_to_baseline(variations: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a baseline ``variations`` block from a run's variation results."""
    out: dict[str, Any] = {
        "variations": {},
        "floor": {"min_judge_score": 3, "min_keyword_coverage": 0.8},
        "judge_tolerance": 1,
    }
    for v in variations:
        scores = v.get("scores", {})
        out["variations"][v["jd_key"]] = {
            "jd_keyword_coverage": scores.get("jd_keyword_coverage"),
            "judge_score": (v.get("judge") or {}).get("score"),
            "non_blank": (v.get("render") or {}).get("non_blank"),
        }
    return out
