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
        if judge is None and base.get("judge_score") is not None:
            # The judge produced a score for this variation at baseline but nothing
            # now (e.g. it errored) — worse than any low score, so flag it.
            regressions.append({
                "jd_key": jd_key,
                "kind": "judge_missing",
                "baseline_value": base.get("judge_score"),
            })
        elif judge is not None and judge < floor.get("min_judge_score", 0):
            regressions.append({"jd_key": jd_key, "kind": "judge_floor", "value": judge})
        if non_blank is False:
            regressions.append({"jd_key": jd_key, "kind": "blank_render", "value": False})
        base_judge = base.get("judge_score")
        if (
            isinstance(judge, int) and not isinstance(judge, bool)
            and isinstance(base_judge, int) and not isinstance(base_judge, bool)
            and (base_judge - judge) > tol
        ):
            regressions.append(
                {"jd_key": jd_key, "kind": "judge_drop", "from": base_judge, "to": judge}
            )

    for jd_key in base_vars:
        if jd_key not in current:
            regressions.append({"jd_key": jd_key, "kind": "missing_variation"})

    return {"regressed": bool(regressions), "regressions": regressions}


def summary_to_baseline(variations: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a baseline ``variations`` block from a run's variation results."""
    out: dict[str, Any] = {
        "variations": {},
        # Floors are the absolute "this is broken" bar; per-variation drift
        # (judge_tolerance) catches regressions above the floor. The fixture set
        # deliberately includes JDs far from the master (frontend/ML/PM) whose
        # truthful tailoring legitimately scores ~2 — so the judge floor sits at
        # 2, not 3, to avoid false-positives on those honest-but-weak variations.
        "floor": {"min_judge_score": 2, "min_keyword_coverage": 0.5},
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
