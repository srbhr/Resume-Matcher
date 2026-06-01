# Agentic End-to-End Monitor — Design Spec

> **Status:** Implemented — harness in `apps/backend/e2e_monitor/` (PR #823); first live sweep run + golden baseline committed. This document is the design record; current state lives in the harness `README.md`.
> **Date:** 2026-06-01
> **Author:** Saurabh Rai (with Claude Code)
> **Branch:** `docs/agentic-e2e-monitor-spec` (off `dev`)
> **Relationship:** Next phase of the testing initiative. The deterministic suites + local
> pre-push gate (PR #820) answer *"is the plumbing correct?"*. This answers the question they
> structurally **cannot**: *"is the running system actually producing good resumes — now and as it drifts?"*

---

## 1. Problem

Green tests do not mean we are making good resumes. The deterministic backend/frontend suites and the
pre-push gate verify *plumbing* — schemas validate, routes return, the i18n shape holds. They are blind to:

- **Output quality drift** — a prompt edit that still passes every structural scorer but quietly makes
  tailored resumes *worse* (less relevant, blander, subtly less truthful). No fixed assertion catches "worse."
- **Flow / render breakage** — the pipeline returns `200 OK` but the PDF is blank or a stage silently
  swallowed an error. This is the **livestream failure**: a high-visibility run where the resume didn't render.
- **Local-provider reality** — recurring user complaints that **Ollama doesn't work**. The mocked-LLM suite
  can't see this; only a real run against a real provider can.

The user's framing: *"All are going in good, because our tests pass right now. But what happens in the
future?? The only way going forward would be to have an agent debug the whole thing — read from logs and
test-files being produced, understand each of the files."*

So we need a **non-deterministic, agentic** verification layer that drives the real app end to end, captures
a durable evidence trail, and has a Claude Code instance judge it — as a **report, never a gate**.

---

## 2. Goals & non-goals

### Goals
1. Drive the **real running app** through the full flow: start → create master resume → generate 3–4
   variations → render PDFs.
2. Capture a **durable evidence bundle** (logs + every intermediate artifact + PDFs) — something that does
   not exist today (the app logs only to the console; the pipeline persists no intermediates).
3. Have an **agent** read that bundle and render an evidence-cited verdict across three jobs:
   **output quality**, **flow/render integrity**, **provider reality-check**.
4. Detect **regression over time** against a committed golden **baseline**, above an absolute floor.
5. Be **safe for an OSS repo**: ~90% maintainer / ~10% contributors / ~0% random users' agents. It must not
   be auto-installed, auto-run, or auto-discovered by every cloner's coding agent.

### Non-goals (explicit YAGNI)
- **No code/standards audit** — reviews + the pre-push gate already cover code hygiene; this watches *runtime*.
- **No provider matrix** — runs against the single configured provider, not a cross-provider sweep.
- **No run-history store** — a committed baseline is the reference, not an accumulated trend log.
- **No CI / cron** — on-demand only. Never a PR gate, never a GitHub Action.
- **No browser automation** — the flow is HTTP-driven; PDFs come from the existing `/pdf` endpoint.
- **No auto-baseline-refresh** — refreshing the golden is a deliberate, reviewed human commit.

---

## 3. Decisions (the locked forks, with rationale)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Three jobs:** output quality + flow/render integrity + provider reality-check (NOT code/standards). | These three are exactly the runtime blind spots of the deterministic suite, and map 1:1 to the user's real pains (silent quality drift, the blank-render livestream, Ollama complaints). |
| 2 | **Two layers:** deterministic capture **harness** + agentic **judge**. The judge produces a **report, never a gate**. | A fuzzy judgment can't block a push the way the pre-push hook does. Separating capture (reproducible) from judgment (non-deterministic) keeps the evidence trustworthy and the cost bounded. |
| 3 | **Agent-in-the-loop** autonomy. The harness is a library of discrete re-runnable "moves"; the agent runs the default sweep, reads the bundle, and re-invokes specific moves to investigate — but can't go fully off-script. | More flexible than a fixed script (can chase anomalies), more trustworthy/reproducible than a fully autonomous agent driving the app (a flaky autonomous run could be the agent's fault, not the app's). |
| 4 | **Configured provider only** — run against whatever `config.json` points at; record which provider it was. | Simplest. To compare Ollama vs cloud, run twice with different configs; the in-loop agent diffs the two bundles. The dev stays in control of provider choice. |
| 5 | **Committed golden baseline** over an **absolute floor**. | Version-controlled, fits the git-centric workflow, no background store. The floor (every stage completes, PDF non-blank, identity preserved, quality ≥ 3/5) is the hard fail; the baseline catches *drift* above the floor. |
| 6 | **Form factor:** standalone harness + a **Claude Code skill**. | Realizes agent-in-the-loop exactly (agent orchestrates deterministic moves), and the harness doubles as a reusable plain E2E smoke test (runs fine with no agent). |
| 7 | **Skill distribution:** the runnable skill is **gitignored**; its source-of-truth is a **committed playbook**. | Gives the 90/10/0 split — maintainer + deliberate contributors get it, no random user's agent ever receives it, and it doesn't leak into the maintainer's other repos. |

---

## 4. Architecture

```
  YOU ──► /monitor-e2e (Claude Code skill = the agent-in-the-loop)
              │
              │ 1. runs the default sweep        ┌─────────────────────────┐
              ├──────────────────────────────────►   HARNESS (moves)       │
              │ 4. re-invokes targeted moves      │  boot · seed-master ·   │
              │    to investigate                 │  tailor · render ·      │
              │                                   │  collect · baseline-diff│
              │                                   └────────────┬────────────┘
              │                                                │ spawns + drives over HTTP
              │                                   ┌────────────▼────────────┐
              │ 2. reads bundle  ◄────writes──────│ backend :8000 (uvicorn) │
              │ 3. applies rubric + baseline diff │ frontend :3000 (Next)   │
              │ 5. writes report.md               │  (real configured LLM)  │
              ▼                                   └─────────────────────────┘
         report.md + session summary
```

**The log-capture trick (zero app changes):** the harness *owns the subprocesses* — it spawns uvicorn and
Next.js itself and redirects their stdout/stderr into log files in the bundle. This produces a durable log
trail **without adding any `FileHandler` to `app/`**. If servers are already running, the harness can
*attach* (skip spawn) instead.

---

## 5. Components & locations

| Path | VC? | What |
|------|-----|------|
| `apps/backend/e2e_monitor/` | ✅ committed | the harness package — `cd apps/backend && uv run python -m e2e_monitor <move>`. Reuses `app.schemas` + the eval `scorers.py` and the backend `uv` env (httpx). |
| `apps/backend/e2e_monitor/fixtures/` | ✅ committed | one rich canonical **master resume** (all sections) + a fixed set of **3–4 JDs** across distinct roles. |
| `apps/backend/e2e_monitor/baseline/baseline.json` | ✅ committed | the accepted golden — scores + flow expectations + content digests. |
| `apps/backend/e2e_monitor/AGENT_PLAYBOOK.md` | ✅ committed | the **source of truth** for the skill body; contributors copy it to opt in. |
| `artifacts/e2e-monitor/<run-id>/` | 🚫 gitignored | per-run evidence bundle. |
| `.claude/skills/monitor-e2e/SKILL.md` | 🚫 gitignored | the live, runnable skill (installed from the playbook). |
| `docs/agent/testing-strategy.md` §10 + harness `README.md` | ✅ committed | the curated, durable record. |

**Optional dependency:** anything beyond the existing backend deps (e.g. a `pypdf` text-probe for the
non-blank PDF check) goes behind `[project.optional-dependencies] e2e-monitor` — **never** pulled by
`uv sync` or `uv sync --extra dev`. Only the maintainer runs `uv sync --extra e2e-monitor`.

---

## 6. The moves (harness CLI)

Each move is deterministic and appends to the bundle.

- **`boot`** — spawn backend + frontend (or attach), redirect their logs to the bundle, wait for `/health`
  on both, write `manifest.json` (run-id, **provider + model from config**, git SHA, timestamps,
  secret-scrubbed config snapshot).
- **`seed-master`** — upload the canonical master via `/resumes/upload`, await processing, save
  `processed_data.json`, record `resume_id`.
- **`tailor --jd <key>`** — `/jobs/upload` → `/resumes/improve/preview` → `/improve/confirm`; save keywords
  + `tailored.json`; run the 5 structural scorers → `scores.json`.
- **`render --variation <key>`** — `/resumes/{id}/pdf`; save the PDF; **non-blank check** (size + page count
  + extractable-text probe) + timing → `render.json`.
- **`judge --variation <key>`** — reuse the eval rubric (`complete_json`, relevance/truthfulness/formatting
  → 1–5) and **record the number** to the bundle for like-for-like baseline comparison.
- **`collect`** — flush logs, finalize `flow-trace.json` (per-stage status/timing/HTTP errors), write
  `summary.json`.
- **`baseline-diff`** — diff this run's scores + flow-trace against `baseline.json` → `baseline-diff.json`.
- **`sweep`** — convenience chain (`boot → seed → tailor×N → render×N → judge×N → collect → baseline-diff`);
  the agent's default first call. **`teardown`** stops spawned servers.

**Opt-in gate (every expensive move):** refuses unless **both** a key is configured (the eval
`_needs_key()` gate) **and** `RM_E2E_MONITOR=1` (or `--yes-spend-tokens`) is set — printing a clear
"monitor disabled by default; this makes real billed LLM calls" message otherwise.

---

## 7. Bundle layout (what the agent reads)

```
artifacts/e2e-monitor/<run-id>/
  manifest.json            summary.json          baseline-diff.json
  flow-trace.json          report.md  ◄── written by the agent
  logs/{backend,frontend}.log
  master/{upload_response,processed_data}.json
  variations/<jd-key>/
     job_description.txt  keywords.json  tailored.json
     scores.json  judge.json  resume.pdf  render.json
```

---

## 8. The agent's judgment (skill / playbook)

After `sweep`, the agent reads `summary.json` + `baseline-diff.json` first, then works the three jobs —
each grounded in a specific artifact so the verdict is **evidence-cited**, not vibes:

- **Output quality** — the 5 structural scorers in `scores.json` are the deterministic floor (no dropped
  sections, no fabricated employers, identity byte-stable, JD-keyword coverage, valid schema). `judge.json`
  adds the rubric score (recorded, for baseline diffing). The *agent* then reads `tailored.json` vs
  `job_description.txt` directly to catch what a fixed rubric misses, and compares to baseline scores.
- **Flow + render integrity** — `flow-trace.json` (every stage status + timing) + `render.json` (non-blank)
  + a **grep of `logs/backend.log`** for tracebacks, swallowed exceptions, the generic-500 pattern, asyncio
  timeouts. A `200` can hide a broken PDF; the log + text-probe won't.
- **Provider reality-check** — manifest records provider+model; the agent scans logs for the **fingerprints
  of local-provider struggle** even when output squeaks through: JSON-mode fallbacks, truncation retries,
  timeout escalation, retry exhaustion, the Ollama `/api/show` probe. Point `config.json` at Ollama, run,
  and the baseline (captured on the known-good provider) makes the gap obvious.

The agent then **re-invokes targeted moves** to investigate anomalies (re-`tailor` a suspect JD, re-`render`
a blank PDF, `collect` fresh logs), writes `report.md` (verdict per job, regressions vs baseline with
evidence citations, reproduction steps, recommended fixes) + a short session summary. It **never** modifies
app code and **never** refreshes the baseline.

---

## 9. Baseline & refresh

`baseline/baseline.json` holds accepted structural scores, judge scores **with tolerance bands** (so model
jitter ≠ a regression — only a floor breach or a drop beyond band flags), flow expectations, and content
digests of the golden outputs. `baseline-diff` flags: any floor breach (hard), any score drop beyond
tolerance, any new log-error signature, any stage that regressed.

**Refresh** = an explicit `python -m e2e_monitor update-baseline` that the dev **reviews and commits** — like
updating a snapshot test. The agent never refreshes it.

---

## 10. Guardrails (leakage prevention — the OSS-safety answer)

Three leak vectors, each closed:

1. **Dependency install** — harness-only deps behind the `e2e-monitor` optional extra; never in
   `uv sync` / `--extra dev`. *Closed by construction.*
2. **Accidental run** — inert code (no import side-effects; never imported by `app/*` or the test suite, so
   `uv run pytest` never touches it; not in `.githooks/pre-push`) + behavioral opt-in (`RM_E2E_MONITOR=1`
   **and** `_needs_key()`). Even a helpful stranger's agent that runs it gets a "disabled by default" no-op.
   *Closed by construction + gate.*
3. **Agent auto-discovery** — the skill is **not committed** as a project skill (which every cloner's agent
   would see). It is gitignored at `.claude/skills/monitor-e2e/`; the committed `AGENT_PLAYBOOK.md` is the
   source of truth; install is one documented copy (or `make e2e-skill`). *Closed by not shipping it.*

Plus: **secrets** — captured logs + manifest run through the `_scrub_secrets` philosophy before hitting the
(gitignored) bundle. **Report, never a gate** — not in the pre-push hook, not in `.github/workflows/`.

---

## 11. Anti-theater (the harness checks itself)

The **pure, dependency-free** helpers — `baseline-diff`, the non-blank heuristic, the log-scrubber, the
flow-trace builder — get **keyless, offline unit tests in the normal suite**, so the harness logic is
version-protected and proven to fire:

- `baseline-diff` must flag a **seeded regression**.
- the non-blank check must **fail a blank PDF**.
- the scrubber must **redact a planted key**.

The side-effectful parts (subprocess spawn / HTTP / LLM) run only in the on-demand sweep — so `uv run
pytest` still never boots a server or spends a token. (The tested pure helpers must not require the optional
`e2e-monitor` extra; the deep `pypdf` text-probe is mocked or skipped when the extra is absent.)

---

## 12. Fixtures, cadence, workflow

- **Fixtures:** one rich canonical master (personalInfo, summary, 2–3 work entries, education, projects,
  skills, a custom section) + **3–4 JDs across distinct roles** (e.g. backend / frontend / ML / PM) — the
  user's "3–4 variations."
- **Cadence:** on-demand — run `/monitor-e2e` before tagging a release or after prompt edits. No cron.
- **Workflow:** new branch off `dev`, same as the rest of the testing initiative; report is informational.

---

## 13. Open questions / future (deliberately deferred)

- **Run-history trend** — an accumulated (gitignored) log of scores/timings for slow-drift detection, on top
  of the baseline. Add later if the baseline alone proves too coarse.
- **Provider matrix** — automatic local-vs-cloud comparison in one run, if manual two-run diffing gets tedious.
- **Scheduled local run** — a local cron/launchd that runs the sweep nightly and pings the maintainer.

---

## 14. Implementation outline (for the eventual plan)

Rough phases, smallest-shippable-first, each independently testable:

1. **Harness skeleton + manifest + opt-in gate** — `boot`/`teardown` (spawn+attach+log capture),
   `manifest.json`, the `RM_E2E_MONITOR` + `_needs_key()` gate. Unit-test the scrubber.
2. **Flow moves + bundle** — `seed-master`, `tailor`, `render` (with non-blank check), `collect`
   (`flow-trace.json` + `summary.json`). Unit-test the non-blank heuristic + flow-trace builder offline.
3. **Scoring + baseline** — wire the structural scorers + `judge`; `baseline-diff` + `update-baseline`;
   commit the first golden. Unit-test baseline-diff against a seeded regression.
4. **Fixtures** — author the canonical master + the 3–4 JDs.
5. **Agent layer** — write `AGENT_PLAYBOOK.md`, the gitignored skill install path, `docs` §10 + README,
   `.gitignore` entries, the optional extra in `pyproject.toml`.

> Next step when resumed: invoke the **writing-plans** skill to turn §14 into a detailed implementation plan.
