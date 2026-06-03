# e2e_monitor — agentic end-to-end monitor

An **opt-in, on-demand** harness that drives the real Resume-Matcher app end to end, captures a durable evidence bundle, and has a Claude Code skill judge it. It is a **report, never a gate** — it informs; it never blocks a push and is never wired into CI.

- Design spec: [`docs/superpowers/specs/2026-06-01-agentic-e2e-monitor-design.md`](../../../docs/superpowers/specs/2026-06-01-agentic-e2e-monitor-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-06-01-agentic-e2e-monitor.md`](../../../docs/superpowers/plans/2026-06-01-agentic-e2e-monitor.md)

---

## Install

```bash
cd apps/backend
uv sync --extra dev --extra e2e-monitor   # keep dev so test deps / the pre-push gate keep working
```

The `e2e-monitor` extra is only needed for the PDF text probe (pypdf-based non-blank check). The harness runs without it, degrading the non-blank check to a header+size heuristic. It is **not** part of the default `uv sync` or `--extra dev` (so random clones are unaffected) — sync it *alongside* `dev`, as above, so opting in doesn't remove your test deps (a bare `uv sync --extra e2e-monitor` would, and then the pre-push gate can't run pytest).

---

## Enable + run

```bash
export RM_E2E_MONITOR=1
cd apps/backend
uv run python -m e2e_monitor sweep
```

The harness gate requires **both** `RM_E2E_MONITOR=1` and a configured LLM key (via `LLM_API_KEY` or the project's config). If either is absent the gate refuses with an explanatory message — nothing runs.

The sweep:
1. Seeds an isolated `DATA_DIR` (your real SQLite DB is never touched).
2. Boots the backend in-process.
3. Tailors the master resume against 3–4 bundled JDs.
4. Attempts PDF renders (skipped/degraded if `node` or the frontend is absent).
5. Scores each variation with the structural eval scorers.
6. Calls the configured LLM as judge for rubric scoring.
7. Writes a self-contained evidence bundle to `artifacts/e2e-monitor/<run-id>/`.
8. Diffs against `baseline/baseline.json` and writes `baseline-diff.json`.

**The sweep only *captures* the bundle — it does not produce the verdict.** It's the deterministic half. The **agent in the loop** — a Claude Code instance, via the `/monitor-e2e` skill below or by just asking any Claude Code session to *"judge the latest e2e-monitor bundle"* — reads the bundle + logs, separates real issues from noise, and writes `report.md`. The sweep's terminal output narrates each move and points you to this handoff.

In practice the front door is **`/monitor-e2e`** (it runs the sweep *and* judges in one step); the bare CLI is the plumbing the agent drives — handy for a quick capture, or a background / cron run that an AI agent later picks up to debug while you work on the app as normal.

---

## Install the agent skill

The `monitor-e2e` Claude Code skill lives at `.claude/skills/monitor-e2e/SKILL.md` — **gitignored, never shipped to other clones**. Its committed source of truth is [`AGENT_PLAYBOOK.md`](AGENT_PLAYBOOK.md) in this directory. Install once per clone:

```bash
bash apps/backend/e2e_monitor/install_skill.sh
```

This copies `AGENT_PLAYBOOK.md` → `.claude/skills/monitor-e2e/SKILL.md`. Then invoke the `monitor-e2e` skill in Claude Code to get the judged report: it reads the bundle, judges the three runtime jobs (output quality, flow/render integrity, provider reality), and writes `report.md` into the bundle directory.

---

## Refresh the baseline

After a sweep whose output you are satisfied with, commit the new golden:

```bash
cd apps/backend
uv run python -m e2e_monitor update-baseline artifacts/e2e-monitor/<run-id>
# review the diff, then:
git add apps/backend/e2e_monitor/baseline/baseline.json
git commit -m "chore(e2e-monitor): update baseline after <run-id>"
```

**This is a deliberate, reviewed human action.** The agent skill never runs `update-baseline` — refreshing the golden is always a maintainer commit.

---

## OSS-safety model

This harness is designed so that cloning the repo and running normal workflows is completely unaffected:

| Mechanism | Effect |
|---|---|
| Optional extra (`--extra e2e-monitor`) | Not pulled in by `uv sync` or `--extra dev` |
| `RM_E2E_MONITOR=1` opt-in | Every entry point checks the gate; inert without the env var |
| No import side effects | The package is not imported by `app/`, `tests/`, or any other module |
| Not in the pre-push hook | `.githooks/pre-push` runs `pytest` only — no e2e sweep |
| Gitignored skill | `.claude/skills/monitor-e2e/` is gitignored; the playbook source is committed but the runnable skill is local-only |
| Isolated `DATA_DIR` | The sweep never reads or writes the developer's real database |

Result: approximately zero random cloners' agents will ever run or even see the monitor.
