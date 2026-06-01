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


def cmd_sweep(_: argparse.Namespace) -> int:
    ensure_enabled()
    from app.config import load_config_file

    bundle = Bundle(root=_ARTIFACTS, run_id=_run_id())
    bundle.ensure()
    config = load_config_file()
    bundle.write_json(
        bundle.dir / "manifest.json",
        build_manifest(run_id=bundle.run_id, git_sha=_git_sha(), config=config, started_at=_now_iso()),
    )

    # Pre-seed the isolated DB with a known master BEFORE booting the server.
    # Canonicalize to the exact ResumeData round-trip the app stores, so every
    # optional field is present. Otherwise improve/preview hashes the raw
    # (field-missing) dict while improve/confirm hashes the schema-defaulted
    # round-trip — a mismatch the app rejects with 400 (its preview/confirm
    # hash gate). See _hash_improved_data in app/routers/resumes.py.
    from app.schemas import ResumeData

    raw_master = json.loads((_FIXTURES / "master.json").read_text(encoding="utf-8"))
    master = ResumeData.model_validate(raw_master).model_dump()
    resume_id = seed_master_db(bundle.data_dir, master)
    bundle.write_json(bundle.master_dir / "processed_data.json", master)

    steps: list[dict[str, Any]] = []
    servers = Servers(bundle=bundle)
    variations: list[dict[str, Any]] = []
    try:
        boot = servers.boot()
        steps.append({"stage": "boot", "ok": True, "ms": 0, "detail": boot})
        steps.append({"stage": "seed-master", "ok": True, "ms": 0, "detail": {"resume_id": resume_id}})

        for jd_key, jd_text in _jds():
            vdir = bundle.variation_dir(jd_key)
            (vdir / "job_description.txt").write_text(jd_text, encoding="utf-8")
            keywords = [
                kw for kw in (w.strip(":,.();") for w in jd_text.split())
                if kw.istitle() and kw.lower() not in _STOPWORDS
            ][:8]

            try:
                t = tailor(resume_id, jd_text, keywords, master)
            except Exception as exc:  # noqa: BLE001
                steps.append({"stage": f"tailor:{jd_key}", "ok": False, "ms": 0, "error": str(exc)})
                continue
            bundle.write_json(vdir / "tailored.json", t["tailored"])
            bundle.write_json(vdir / "scores.json", t["scores"])
            steps.append({"stage": f"tailor:{jd_key}", "ok": True, "ms": 0})

            try:
                judge = asyncio.run(judge_variation(jd_text, t["tailored"]))
            except Exception as exc:  # noqa: BLE001
                judge = {"score": None, "reasons": f"judge failed: {exc}"}
                steps.append({"stage": f"judge:{jd_key}", "ok": False, "ms": 0, "error": str(exc)})
            bundle.write_json(vdir / "judge.json", judge)

            render: dict[str, Any] = {"non_blank": None}
            if servers.frontend_up and t["tailored_resume_id"]:
                try:
                    pdf, render = render_variation(t["tailored_resume_id"])
                    (vdir / "resume.pdf").write_bytes(pdf)
                    bundle.write_json(vdir / "render.json", render)
                    steps.append({"stage": f"render:{jd_key}", "ok": bool(render["non_blank"]), "ms": 0})
                except Exception as exc:  # noqa: BLE001
                    steps.append({"stage": f"render:{jd_key}", "ok": False, "ms": 0, "error": str(exc)})
            variations.append({"jd_key": jd_key, "scores": t["scores"], "judge": judge, "render": render})
    finally:
        servers.teardown()

    flow = build_flow_trace(steps)
    bundle.write_json(bundle.dir / "flow-trace.json", flow)
    summary = build_summary(flow=flow, variations=variations, provider=config.get("provider", ""))
    bundle.write_json(bundle.dir / "summary.json", summary)
    if _BASELINE.exists():
        current = {
            v["jd_key"]: {
                "jd_keyword_coverage": v["scores"]["jd_keyword_coverage"],
                "judge_score": (v.get("judge") or {}).get("score"),
                "non_blank": (v.get("render") or {}).get("non_blank"),
            }
            for v in variations
        }
        bundle.write_json(
            bundle.dir / "baseline-diff.json",
            diff_against_baseline(current, bundle.read_json(_BASELINE)),
        )
    print(f"bundle: {bundle.dir}")
    return 0


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="e2e_monitor")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("sweep").set_defaults(func=cmd_sweep)
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
