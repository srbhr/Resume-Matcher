"""Offline tests for flow-trace + summary roll-ups."""

from __future__ import annotations

import json
import stat
from pathlib import Path

import pytest

from e2e_monitor.bundle import Bundle
from e2e_monitor.collect import build_flow_trace, build_summary
from e2e_monitor.timing import measured_step

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


def test_failure_traceback_is_private_while_public_artifacts_stay_generic(
    tmp_path: Path,
) -> None:
    bundle = Bundle(tmp_path, "failed-run")
    bundle.ensure()
    steps: list[dict[str, object]] = []
    private_marker = "synthetic Authorization credential and response body"

    with (
        pytest.raises(RuntimeError, match="synthetic Authorization"),
        measured_step(
            steps,
            "judge:synthetic",
            on_error=bundle.write_diagnostic,
        ),
    ):
        raise RuntimeError(private_marker)

    flow = build_flow_trace(steps)
    summary = build_summary(flow=flow, variations=[], provider="synthetic")
    bundle.write_json(bundle.dir / "flow-trace.json", flow)
    bundle.write_json(bundle.dir / "summary.json", summary)

    public_text = "\n".join(
        (bundle.dir / name).read_text() for name in ("flow-trace.json", "summary.json")
    )
    assert (
        json.loads((bundle.dir / "flow-trace.json").read_text())["stages"][0]["error"]
        == "RuntimeError"
    )
    assert private_marker not in public_text

    diagnostic_path = bundle.private_diagnostic_path
    diagnostic = diagnostic_path.read_text()
    assert "Traceback (most recent call last)" in diagnostic
    assert private_marker in diagnostic
    assert stat.S_IMODE(diagnostic_path.stat().st_mode) == 0o600
