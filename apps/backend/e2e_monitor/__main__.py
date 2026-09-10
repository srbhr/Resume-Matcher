"""CLI: ``uv run python -m e2e_monitor <move> [args]`` (run from apps/backend).

Every move calls ``ensure_enabled()`` first. ``sweep`` pre-seeds the isolated DB
with a known master, boots the servers, tailors N variations, judges + (when the
frontend is up) renders each, then writes the bundle (flow-trace, summary, and a
baseline-diff when a committed baseline exists).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from e2e_monitor.baseline import diff_against_baseline, summary_to_baseline
from e2e_monitor.bundle import Bundle
from e2e_monitor.collect import build_flow_trace, build_summary
from e2e_monitor.flow import seed_master_db, tailor
from e2e_monitor.gate import MonitorDisabled, ensure_enabled
from e2e_monitor.judge import judge_variation
from e2e_monitor.manifest import build_manifest
from e2e_monitor.render import render_variation
from e2e_monitor.servers import Servers
from e2e_monitor.timing import measured_step

_BACKEND = Path(__file__).resolve().parents[1]
_PKG = Path(__file__).resolve().parent
_ARTIFACTS = _BACKEND.parents[1] / "artifacts" / "e2e-monitor"
_FIXTURES = _PKG / "fixtures"
_BASELINE = _PKG / "baseline" / "baseline.json"

_STOPWORDS = frozenset({
    "we", "you", "our", "your", "the", "a", "an", "and", "or", "for", "with",
    "to", "of", "in", "on", "is", "are", "as", "at", "be", "by", "this", "that",
})


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=_BACKEND, text=True
        ).strip()
    except Exception:
        return "unknown"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def _jds() -> list[tuple[str, str]]:
    return sorted(
        (p.stem, p.read_text(encoding="utf-8")) for p in (_FIXTURES / "jds").glob("*.txt")
    )


def _say(msg: str) -> None:
    """Print live loop narration to stderr.

    Progress/handoff text goes to stderr so the machine-readable ``bundle: <path>``
    line stays alone on stdout for scripts/agents that parse it.
    """
    print(msg, file=sys.stderr, flush=True)


def cmd_sweep(args: argparse.Namespace) -> int:
    ensure_enabled()
    from app.config import load_config_file
    from app.schemas import ResumeData

    bundle = Bundle(root=_ARTIFACTS, run_id=_run_id())
    bundle.ensure()
    config = load_config_file()
    bundle.write_json(
        bundle.dir / "manifest.json",
        build_manifest(run_id=bundle.run_id, git_sha=_git_sha(), config=config, started_at=_now_iso()),
    )
    steps: list[dict[str, Any]] = []
    variations: list[dict[str, Any]] = []
    servers = Servers(
        bundle=bundle, backend_port=args.backend_port, frontend_port=args.frontend_port
    )
    _say(f"e2e-monitor: run {bundle.run_id}")
    try:
        with measured_step(
            steps, "seed-master", on_error=bundle.write_diagnostic
        ) as step:
            raw_master = json.loads(
                (_FIXTURES / "master.json").read_text(encoding="utf-8")
            )
            master = ResumeData.model_validate(raw_master).model_dump()
            resume_id = asyncio.run(seed_master_db(bundle.data_dir, master))
            bundle.write_json(bundle.master_dir / "processed_data.json", master)
            step["detail"] = {"resume_id": resume_id}
        with measured_step(steps, "boot", on_error=bundle.write_diagnostic) as step:
            step["detail"] = servers.boot(with_frontend=not args.no_frontend)

        for jd_key, jd_text in _jds():
            vdir = bundle.variation_dir(jd_key)
            (vdir / "job_description.txt").write_text(jd_text, encoding="utf-8")
            keywords = [
                kw
                for kw in (w.strip(":,.();") for w in jd_text.split())
                if kw.istitle() and kw.lower() not in _STOPWORDS
            ][:8]
            try:
                with measured_step(
                    steps,
                    f"tailor:{jd_key}",
                    on_error=bundle.write_diagnostic,
                ):
                    result = tailor(
                        resume_id, jd_text, keywords, master, api_base=servers.api_base
                    )
                    bundle.write_json(vdir / "tailored.json", result["tailored"])
                    bundle.write_json(vdir / "scores.json", result["scores"])
            except Exception:
                _say(f"{jd_key}: tailoring failed; see backend log and flow trace")
                continue
            failed_judge = {
                "score": None,
                "reasons": "Judge failed to return a valid score.",
            }
            judge = failed_judge
            try:
                with measured_step(
                    steps,
                    f"judge:{jd_key}",
                    on_error=bundle.write_diagnostic,
                ):
                    try:
                        judge = asyncio.run(
                            judge_variation(jd_text, result["tailored"], master)
                        )
                        if judge.get("score") is None:
                            raise ValueError("Judge returned no valid score")
                    finally:
                        bundle.write_json(vdir / "judge.json", judge)
            except Exception:
                judge = failed_judge
            render: dict[str, Any] = {"non_blank": None}
            try:
                with measured_step(
                    steps,
                    f"render:{jd_key}",
                    on_error=bundle.write_diagnostic,
                ) as step:
                    if servers.frontend_up and result["tailored_resume_id"]:
                        pdf, render = render_variation(
                            result["tailored_resume_id"], api_base=servers.api_base
                        )
                        (vdir / "resume.pdf").write_bytes(pdf)
                        bundle.write_json(vdir / "render.json", render)
                        if not render["non_blank"]:
                            raise ValueError("Rendered PDF is blank")
                    else:
                        step["skipped"] = True
                        step["detail"] = {
                            "reason": "Frontend unavailable or no confirmed result"
                        }
            except Exception:
                render = {**render, "non_blank": False}
            variations.append(
                {
                    "jd_key": jd_key,
                    "scores": result["scores"],
                    "judge": judge,
                    "render": render,
                }
            )
    finally:
        try:
            with measured_step(steps, "teardown", on_error=bundle.write_diagnostic):
                servers.teardown()
        finally:
            flow = build_flow_trace(steps)
            bundle.write_json(bundle.dir / "flow-trace.json", flow)
            summary = build_summary(
                flow=flow, variations=variations, provider=config.get("provider", "")
            )
            bundle.write_json(bundle.dir / "summary.json", summary)
            if _BASELINE.exists():
                current = {
                    v["jd_key"]: {
                        "jd_keyword_coverage": v["scores"]["jd_keyword_coverage"],
                        "judge_score": v["judge"].get("score"),
                        "non_blank": v["render"].get("non_blank"),
                    }
                    for v in variations
                }
                bundle.write_json(
                    bundle.dir / "baseline-diff.json",
                    diff_against_baseline(current, bundle.read_json(_BASELINE)),
                )
            print(f"bundle: {bundle.dir}")
    _say(
        f"Captured {len(variations)} variations. Review the evidence bundle before drawing quality conclusions."
    )
    return 0 if summary["flow_all_passed"] else 1


def cmd_update_baseline(args: argparse.Namespace) -> int:
    ensure_enabled(require_key=False)
    run_dir = Path(args.run_dir)
    variations: list[dict[str, Any]] = []
    for vdir in sorted((run_dir / "variations").glob("*")):
        variations.append({
            "jd_key": vdir.name,
            "scores": Bundle.read_json(vdir / "scores.json"),
            "judge": Bundle.read_json(vdir / "judge.json") if (vdir / "judge.json").exists() else {},
            "render": Bundle.read_json(vdir / "render.json") if (vdir / "render.json").exists() else {},
        })
    _BASELINE.parent.mkdir(parents=True, exist_ok=True)
    Bundle.write_json(_BASELINE, summary_to_baseline(variations))
    print(f"baseline updated from {run_dir} -> {_BASELINE} (review + commit it)")
    return 0


def _port_number(value: str) -> int:
    port = int(value)
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("Port must be between 1 and 65535")
    return port


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="e2e_monitor")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sweep = sub.add_parser("sweep")
    sweep.add_argument("--backend-port", type=_port_number, default=8000)
    sweep.add_argument("--frontend-port", type=_port_number, default=3000)
    sweep.add_argument("--no-frontend", action="store_true")
    sweep.set_defaults(func=cmd_sweep)
    ub = sub.add_parser("update-baseline")
    ub.add_argument("run_dir")
    ub.set_defaults(func=cmd_update_baseline)
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except MonitorDisabled as exc:
        print(f"e2e-monitor: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
