"""Flow-trace and summary roll-ups (pure functions over recorded step results)."""

from __future__ import annotations

from typing import Any


def build_flow_trace(steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize per-stage status/timing into ``flow-trace.json`` shape."""
    failed = sum(1 for s in steps if not s.get("ok"))
    return {
        "total": len(steps),
        "failed": failed,
        "all_passed": failed == 0,
        "stages": list(steps),
    }


def build_summary(
    *, flow: dict[str, Any], variations: list[dict[str, Any]], provider: str
) -> dict[str, Any]:
    """The cheap orientation object the agent reads first."""
    judge_scores = [
        v["judge"]["score"] for v in variations
        if isinstance(v.get("judge"), dict) and isinstance(v["judge"].get("score"), int)
        and not isinstance(v["judge"].get("score"), bool)
    ]
    renders_non_blank = sum(
        1 for v in variations if isinstance(v.get("render"), dict) and v["render"].get("non_blank")
    )
    return {
        "provider": provider,
        "variations": len(variations),
        "flow_all_passed": flow.get("all_passed", False),
        "flow_failed_stages": [s["stage"] for s in flow.get("stages", []) if not s.get("ok")],
        "renders_non_blank": renders_non_blank,
        "min_judge_score": min(judge_scores) if judge_scores else None,
    }
