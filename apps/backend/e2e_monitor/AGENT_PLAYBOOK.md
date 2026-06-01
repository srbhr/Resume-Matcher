---
name: monitor-e2e
description: Run + judge the Resume-Matcher agentic end-to-end monitor. Drives the real app (master resume → 3–4 tailored variations → PDFs), captures an evidence bundle, then renders an evidence-cited verdict on output quality, flow/render integrity, and provider reality vs a committed baseline. Maintainer-only; makes real, billed LLM calls — do NOT run proactively.
---

# monitor-e2e — agentic end-to-end monitor

You drive Resume-Matcher end to end, then judge the result. You are a REPORT, never a gate: you never block anything, never modify app code, and never refresh the baseline.

## 0. Preconditions (refuse otherwise)
- This makes REAL, BILLED LLM calls and boots servers. Only run when the maintainer explicitly asks.
- Requires `RM_E2E_MONITOR=1` and a configured LLM key (the harness gate enforces both — if it refuses, surface the message and stop).
- Run from `apps/backend`. The optional PDF text probe needs `uv sync --extra dev --extra e2e-monitor` (keep `dev` so test deps aren't removed).

## 1. Run the sweep
```
cd apps/backend && RM_E2E_MONITOR=1 uv run python -m e2e_monitor sweep
```
Note the printed `bundle: artifacts/e2e-monitor/<run-id>/`. Everything you judge lives there.

## 2. Orient (cheap, first)
Read `summary.json` and `baseline-diff.json` first: provider, variation count, `flow_all_passed`, `renders_non_blank`, `min_judge_score`, and any regressions vs the committed baseline.

## 3. Judge the three jobs — cite the artifact for every claim
**A. Output quality** — for each `variations/<jd>/`: read `scores.json` (structural floor — `fabricated_employers` MUST be `[]`, `personal_info_unchanged` MUST be true, plus sections_preserved / is_valid_resume / jd_keyword_coverage) and `judge.json` (1–5 rubric). Open `tailored.json` vs `job_description.txt` and read for what a fixed rubric misses — is it a strong, TRUTHFUL tailoring for THIS jd? **JD-keyword policy (maintainer, 2026-06):** incorporating job-description keywords/skills the master lacked is EXPECTED ATS tailoring, not fabrication, up to ~`JD_KEYWORD_TOLERANCE` (see `judge.py`, currently 20%) of resume content — do not flag it. What stays a defect: invented employers, fabricated titles/dates, or a wholesale change of profession beyond that tolerance. The `product-manager` jd is the truthfulness stress test: a little PM-flavored wording is fine, but the tailoring must NOT manufacture a PM career the master never had (career-changer framing is the honest outcome).
**B. Flow + render integrity** — read `flow-trace.json` (did every stage pass?) and each `render.json` (`non_blank`?). Then GREP `logs/backend.log` for `Traceback`, `ERROR`, ` 500 `, `TimeoutError`, `wait_for`, and swallowed exceptions. A 200 response can hide a broken PDF — trust the log + the non-blank check.
**C. Provider reality** — note provider+model from `manifest.json`. Grep `logs/backend.log` for local-provider struggle fingerprints: JSON-mode fallback, truncation / `_appears_truncated`, content-quality retries, timeout escalation, retry exhaustion, Ollama `/api/show`. Even when output squeaks through, these show the provider straining. (To compare providers, the maintainer re-runs with config pointed at another provider and you diff the two bundles.)

## 4. Investigate anomalies
For anything that looks off (a low judge score, a blank render, a log error), open that variation's files and the logs and dig in before concluding.

## 5. Write the report
Write `report.md` INTO the bundle dir, plus a short session summary. Structure: a verdict per job (quality / flow-render / provider), regressions vs baseline with evidence citations (artifact paths inside the bundle), reproduction notes, and recommended fixes. Be specific; cite artifacts.

## Hard rules
- NEVER modify app code or tests.
- NEVER run `update-baseline` yourself — refreshing the golden is a deliberate maintainer commit.
- You are advisory. Your output informs; it does not gate.
