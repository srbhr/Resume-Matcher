"""Offline tests for flow-trace + summary roll-ups."""

from __future__ import annotations

from e2e_monitor.collect import build_flow_trace, build_summary

_STEPS = [
    {"stage": "boot", "ok": True, "ms": 1200},
    {"stage": "seed-master", "ok": True, "ms": 8000},
    {"stage": "tailor:backend-eng", "ok": True, "ms": 30000},
    {"stage": "render:backend-eng", "ok": False, "ms": 31000, "error": "blank pdf"},
]


def test_build_flow_trace_counts_and_orders() -> None:
    trace = build_flow_trace(_STEPS)
    assert trace["total"] == 4
    assert trace["failed"] == 1
    assert trace["all_passed"] is False
    assert trace["stages"][0]["stage"] == "boot"


def test_build_summary_rolls_up_scores_and_flow() -> None:
    variations = [
        {"jd_key": "backend-eng", "scores": {"jd_keyword_coverage": 1.0, "personal_info_unchanged": True},
         "judge": {"score": 4}, "render": {"non_blank": False}},
    ]
    s = build_summary(flow=build_flow_trace(_STEPS), variations=variations, provider="ollama")
    assert s["provider"] == "ollama"
    assert s["variations"] == 1
    assert s["flow_all_passed"] is False
    assert s["renders_non_blank"] == 0
    assert s["min_judge_score"] == 4
