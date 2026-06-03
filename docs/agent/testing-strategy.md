# Testing Strategy & Verification Plan

> **Status:** Living document. Started 2026-05-30 on branch `test/backend-coverage-foundation` (base: `dev`).
> **Scope:** Backend (`apps/backend`, Phases 1–6) **and** frontend (`apps/frontend`, vitest — §8). Gating is a local `pre-push` hook, not PR CI.
> **Why this exists:** We shipped a build break that no automation caught, users report "Ollama doesn't work" and "resume won't render," and we had no evidence-based read on whether our tests are real or theater. This doc is the resumable record of the assessment and the plan.

---

## 1. TL;DR

- A real backend test suite already exists: **192 tests**, `pytest` + `pytest-asyncio` + `httpx`. We do **not** need a new framework.
- When run: **191 pass, 1 fails, 54% line coverage.** The one failure (`test_health_returns_degraded`) is a **stale test**, not a product bug — and the fact it sat red proves the suite is **never run by automation**.
- Root cause of "the build broke and nobody caught it": **there is no PR-gating CI.** The only workflow is `docker-publish.yml` (build+push on merge to `main`). Nothing runs `pytest`, `tsc`, `next build`, or lint before merge.
- The tests we have cluster on the **deterministic algorithmic core** (diff engine, schemas) and **mock away the entire I/O surface** (DB, LLM, parser, Playwright). So coverage is real where it exists but absent exactly where users get hurt.
- Two test types are needed and are **different things**: deterministic tests (plumbing correctness, LLM mocked, run on every change) and **evals** (LLM output quality, real/recorded LLM, run on demand/nightly). We have the first kind only for the core, and zero of the second.

---

## 2. Current-state assessment (evidence)

Run command (no `pyproject.toml` change — ephemeral coverage plugin):

```bash
cd apps/backend
uv run --with pytest-cov pytest -q --cov=app --cov-report=term-missing
# 192 tests · 191 passed · 1 FAILED · 54% coverage · ~6s
```

### 2.1 The one failure is the canary

`tests/integration/test_health_api.py::test_health_returns_degraded` expects `GET /health` to report `"degraded"` when the LLM is unhealthy. But `app/routers/health.py` was refactored so `/health` is a **pure liveness probe** that never calls the LLM (`return HealthResponse(status="healthy")`); readiness now lives at `GET /status`. The test was never updated. Its sibling `test_health_returns_healthy` *passes for the wrong reason* — it mocks `check_llm_health`, which the endpoint no longer calls, so the mock is dead and the assertion is hollow.

Takeaway: a green checkmark here meant nothing, and a red one went unseen. That is the exact failure mode behind the production incidents.

### 2.2 Coverage map (what's real vs absent)

| Module | Cover | Read |
|---|---|---|
| `services/improver.py` (diff engine) | 84% | ✅ Genuinely strong — path resolution, apply/verify diffs, skill gating |
| `schemas/models.py` | 88% | ✅ Real |
| `services/refiner.py` | 72% | ✅ Decent |
| `routers/config.py` | 53% | 🟡 Contract-level only |
| `llm.py` | 47% | 🟡 Pure helpers tested; **real request + `check_llm_health` + Ollama paths NOT** |
| `routers/enrichment.py` | 38% | 🟡 Regenerate matching tested; rest mocked |
| `config_cache.py` | 38% | 🔴 |
| `database.py` | 34% | 🔴 Real DB not exercised *at this baseline* — integration tests mocked `db` (changed in Phases 4 & 7) |
| `services/cover_letter.py` | 26% | 🔴 Untested |
| `services/parser.py` | 20% | 🔴 Upload→markdown→JSON untested; even the pure date-restore is uncovered |
| `pdf.py` (render) | 20% | 🔴 The "resume won't render" class |
| `routers/resumes.py` | 18% | 🔴 Biggest file (1,796 LOC): tailor + PDF + CRUD — almost entirely untested |

### 2.3 The structural truth about the integration tests (at the 192-test baseline)

At the 192-test baseline, every `tests/integration/*` test patched `app.routers.<x>.db` and the LLM/parse calls. They verified **status codes, request validation, response shape, and router branch logic** (e.g. API-key masking, regenerate fallback matching) — valuable *contract* tests. They did **not** prove the database persists, Playwright renders, markitdown parses, or any provider (Ollama included) actually responds. *(Phases 4 & 7 below later added real-SQLite `isolated_db` persistence + pipeline/tracker integration tests.)*

---

## 3. The framework decision

**Keep `pytest` + `pytest-asyncio` + `httpx`.** It is correctly configured (`asyncio_mode=auto`, strict markers, `unit`/`service`/`integration` markers). Add, incrementally:

| Need | Tool | Why |
|---|---|---|
| Coverage as a tracked number | `pytest-cov` | Quantify gaps & deltas; stop guessing |
| Real `llm.py` against a fake provider (incl. Ollama) | `respx` (or `pytest-httpx`) | Mock at the HTTP transport so our actual routing/normalization code runs — the only way to regression-test "Ollama doesn't work" |
| PDF render proof | Playwright (already a dep) | One smoke test → real PDF bytes from the print route |
| Prompt/skill quality | In-repo **eval harness** | Golden fixtures + structural scorers + optional LLM-as-judge |
| Push gate (local, replaces PR CI) | `pre-push` git hook (`.githooks/`) | Runs backend suite + locale parity, blocks red pushes; no PR-triggered CI — see §5 Phase 6 |

### 3.1 Deterministic tests vs evals (the key distinction)

- **Deterministic test** — LLM mocked, asserts code behavior given a known response. Fast, runs on every change. Answers *"is the plumbing correct?"*
- **Eval** — real (or recorded) LLM call scored against a rubric. Non-deterministic, costs money/time, runs nightly/on-demand, **never in the PR gate**. Answers *"did this prompt change make the output better?"*

You cannot answer "does my prompt change help?" with a deterministic test. You need evals. Conversely you should never block a PR on a non-deterministic eval. Both layers, kept separate.

### 3.2 The prompt chain ("skills") and how each stage is tested

```
upload → parse_resume_to_json
       → extract_job_keywords
       → generate_skill_target_plan → verify_skill_target_plan   (verify = pure, deterministic gate)
       → generate_resume_diffs  [strategy: keywords | nudge | full]
       → apply_diffs            (pure)
       → render_resume_pdf
```

For each stage:
- **Deterministic layer** — structural invariants that hold regardless of wording: valid JSON/schema, **no fabricated employers/dates** (truthfulness rules), every section preserved, JD keywords actually present in output, diff paths resolve. Most "the prompt change broke something" regressions are caught here, for free.
- **Eval layer** — golden `(resume, job_description)` fixtures → run the stage with a real model → score with a rubric (heuristic + LLM-as-judge). Tracks quality over time and across prompt edits.

---

## 4. What "verify our recent work" means here

Three concrete mechanisms, applied to every change in this initiative:

1. **Coverage delta.** Each batch reports before/after coverage for the modules it touches. Numbers, not vibes.
2. **Anti-theater check.** For new tests on critical logic, confirm the test *fails when the code is broken* (a quick manual mutation). This is the antidote to the `test_health_returns_healthy` "passes for the wrong reason" trap.
3. **Regression tests that pin recent PRs.** The first new coverage deliberately locks in behavior we recently shipped, so "our recent work" gains a safety net:
   - `_normalize_api_base` — the `/v1/v1` duplicate-path dedup and OpenAI preserve-as-is (issue #751).
   - `resolve_api_key` — the security rule that `ollama`/`openai_compatible` must **not** fall back to the env `LLM_API_KEY` (so a paid key can't leak to a local server).
   - `get_model_name` — `ollama_chat/` prefix and OpenRouter nested prefixes.
   - Empty-extracted-text rejection on upload (`resumes.py:546`, PR #794).
   - `restore_dates_from_markdown` — months survive LLM parsing.

---

## 5. Phased roadmap

Legend: ✅ done · 🚧 in progress · ⬜ planned

**Phase 1 — Foundation + cheap deterministic coverage (PR #820 → `dev`) ✅ COMPLETE**
- ✅ Audit + this document
- ✅ Make the suite green (fixed stale `health` tests; liveness vs readiness)
- ✅ `llm.py` provider/Ollama pure-function regression tests (`tests/unit/test_llm_providers.py`)
- ✅ `parser.py` pure tests (date restoration) (`tests/unit/test_parser.py`) + empty-text rejection (`tests/integration/test_upload_api.py`)
- ✅ Real-SQLite `database.py` CRUD tests (`tests/unit/test_database.py`)
- ✅ Verify: **192 → 265 tests, 1 silent failure → 0, coverage 54% → 58%** (database 34→96%, parser 20→72%, llm 47→55%, health now meaningful). Anti-theater mutation check passed.

**Phase 2 — Transport contract tests (LLM/Ollama) ✅ COMPLETE** (`tests/integration/test_llm_contract.py`, 8 tests)
- ✅ `respx`-backed tests: real `complete` / `complete_json` / `check_llm_health` against a fake Ollama + OpenAI-compatible HTTP server (base-URL handling #751, JSON extraction over the wire, thinking-tag stripping, health error-code mapping + secret scrubbing). Findings: litellm 1.86 defaults to an aiohttp transport respx can't see → tests set `disable_aiohttp_transport`; Ollama makes two calls (`/api/show` probe + `/api/chat`). **`llm.py` 55% → 74%.**

**Phase 3 — Render safety net ✅ COMPLETE** (`tests/integration/test_pdf_render.py`, 11 tests)
- ✅ Real headless-Chromium render of a self-contained `data:` URL → asserts genuine `%PDF` bytes; pure-helper tests (format/margins); connection-refused → `PDFRenderError` mapping. Render tests skip cleanly without Chromium. **`pdf.py` 20% → 54%.**

**Phase 4 — End-to-end pipeline ✅ COMPLETE** (`tests/integration/test_pipeline_e2e.py`, 5 tests)
- ✅ Real routers + real temp DB (`isolated_db`), every LLM boundary mocked: upload → jobs → fetch **and** the preview→confirm tailoring handshake. Asserts real persisted state (master invariant, `parent_id` linkage, `improvements` record). **`resumes.py` 18% → 53%.**

**Phase 5 — Eval harness (structural + LLM-as-judge) ✅ COMPLETE** (`tests/evals/`, 31 scorer tests + 1 gated judge)
- ✅ Pure structural scorers (`sections_preserved`, `no_fabricated_employers`, `jd_keywords_present`, `is_valid_resume`, `personal_info_unchanged`) + golden fixtures, each proven on good AND bad inputs.
- ✅ LLM-as-judge marked `@pytest.mark.eval`, uses the developer's own configured key, **excluded from the default run** (`addopts -m "not eval"`); run on demand with `uv run pytest -m eval`. Skips cleanly with no key.

**Phase 6 — Local pre-push gate (replaces PR CI) ✅ COMPLETE** (`.githooks/pre-push`)
- ✅ A version-controlled `pre-push` hook runs the backend suite + a node-free locale-parity check and **blocks the push on red**. Activate per-clone with `git config core.hooksPath .githooks`; bypass with `git push --no-verify`. See `.githooks/README.md`.
- ✅ We **deliberately avoid a GitHub Actions PR gate** — the repo gets a high volume of external contributor PRs; PR-triggered CI would run on every one (and run untrusted code). The local hook keeps `dev`/`main` green for the maintainer's own pushes without that cost.
- ⬜ (Optional, future) a Node-based `tsc`/`next build` check — deferred due to nvm-in-hook fragility; the pure-Python locale-parity guard already covers the known i18n break.

**Phase 7 — SQLite persistence + tracker + encrypted-keys coverage (PRs #841 + #843 → `main`) ✅ COMPLETE**
- ✅ The persistence layer moved from TinyDB to **SQLite (async SQLAlchemy)**; the `conftest.py::isolated_db` fixture now swaps a disposable **temp-file SQLite** DB (not TinyDB) across all router modules, and `tests/unit/test_database.py` exercises **real SQLite CRUD** (incl. `TestApplications`).
- ✅ New tracker coverage: `tests/integration/test_applications_api.py` (CRUD, column grouping, detail tolerance for a deleted resume, bulk move/delete) and `tests/integration/test_tracker_autocreate.py` (confirming a tailoring auto-creates an `applied` card).
- ✅ Encrypted per-provider API keys: `tests/unit/test_crypto.py` (Fernet encrypt/decrypt round-trip + masking).
- ✅ `/status` graceful degradation (#843): `tests/integration/test_health_api.py` expanded — each check isolated, so a single failing probe yields 200 with partial/degraded state instead of 500.
- ✅ Verify: default `uv run pytest` count is now **~444** (was ~320). `respx` still mocks the HTTP transport for `llm.py`.

### Result after Phases 1–7
**192 → ~444 deterministic tests** (+ 1 opt-in LLM-judge eval), **0 failures**. Phases 1–5 were built via parallel subagents (one per phase, strict file ownership) using the `dispatching-parallel-agents` skill; Phase 7 followed the TinyDB→SQLite migration (PRs #841 + #843).

---

## 6. How to run

```bash
cd apps/backend

# Full deterministic suite (LLM-judge evals are auto-excluded via addopts -m "not eval")
uv run pytest

# Coverage (ephemeral plugin, no pyproject change)
uv run --with pytest-cov pytest -q --cov=app --cov-report=term-missing

# Prompt-quality evals on demand — structural scorers always run; the LLM-judge
# runs only when an LLM key is configured (uses the developer's own key), else skips
uv run pytest -m eval

# One module
uv run pytest tests/unit/test_parser.py -q
```

> `uv run pytest` is unaffected by the project's nvm/npm constraints — it's Python-only. Frontend `tsc`/`build`/lint are run separately and are out of scope for this backend phase.

---

## 7. Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-30 | Base this initiative on **`dev`**, not `main`. Sync `dev`←`main`, branch off `dev`, merge work back to `dev`. | User directive — batch this important work on `dev` before it reaches `main`. |
| 2026-05-30 | **No CI workflow yet** (tests only). | User directive. CI is the highest-ROI fix but is a separate, explicit decision (and `.github/workflows/` is change-controlled). |
| 2026-05-30 | Eval layer = **structural + LLM-as-judge**, judge uses the **developer-provided** LLM key, skipped when absent. | User directive — the developer (usually the maintainer) supplies the key, so real-LLM scoring is acceptable when configured. |
| 2026-05-30 | Keep `pytest`; add `respx`, `pytest-cov`, Playwright smoke, eval harness. | Existing framework is correct; fill gaps rather than replace. |
| 2026-05-30 | Gate pushes with a **local `pre-push` hook**, NOT GitHub Actions on PRs. | Maintainer gets a high volume of external PRs; PR-triggered CI would run on all of them (incl. untrusted code). A local hook keeps `dev`/`main` green for the maintainer's own pushes — backend suite + node-free locale parity — without that cost. `.githooks/` + `core.hooksPath`. |

---

## 8. Frontend test suite

`apps/frontend` uses **vitest + Testing Library (jsdom)** — run `npm run test` (or `./node_modules/.bin/vitest run`). The same rigor as the backend was applied: assess what existed (a green 65-test suite over `download-utils` + two components), then cover the highest-value untested logic.

Added (`apps/frontend/tests/`):
- `i18n-utils.test.ts` — the `t()` engine (`getNestedValue` dot-path + missing-key fallback, `applyParams` substitution).
- `i18n-locale-parity.test.ts` — **in-suite guard for the build break**: every `messages/*.json` must structurally match `en.json` (mirrors `scripts/check_locale_parity.py`). Verified anti-theater (adding a key to `en.json` fails all four locales).
- `keyword-matcher.test.ts` — JD↔resume keyword extract/segment/match-stats.
- `section-helpers.test.ts` — section ordering, custom-section IDs, localize-only-untouched-defaults.
- `html-sanitizer.test.ts` — the DOMPurify XSS whitelist (`strong/em/u/a`).
- `api-client.test.ts` — `lib/api/client` URL resolution + timeout/AbortError (`fetch` stubbed).

Net: **65 → 117 frontend tests**, all green. The `pre-push` gate runs this suite when Node is available; a full `tsc`/`next build` gate remains future work (nvm-in-hook fragility).

---

## 9. Open questions / future

- ✅ ~~Frontend locale-parity test~~ — done (`i18n-locale-parity.test.ts` + the hook's `scripts/check_locale_parity.py`).
- Decide coverage floors per module once the I/O surface is broadly covered (avoid a single global % that hides gaps).
- A Node-aware `tsc`/`next build` gate (catches TS errors beyond locale drift) — deferred; needs reliable node-in-hook.
- If GitHub Actions is ever reconsidered, run it on push to `dev`/`main` only (not on PRs).

---

## 10. Agentic end-to-end monitor (on-demand, report-only)

Above the deterministic suites and the local pre-push gate sits an **agentic E2E monitor** — an opt-in, on-demand harness that drives the *real* running app (master resume → 3–4 tailored variations → PDFs), captures a durable evidence bundle (logs + every intermediate JSON + PDFs), and has a Claude Code skill judge it across three runtime jobs: **output quality**, **flow/render integrity**, and **provider reality**. It is a **report, never a gate** — it informs, never blocks a push, and is never wired into CI.

- Design: `docs/superpowers/specs/2026-06-01-agentic-e2e-monitor-design.md`; plan: `docs/superpowers/plans/2026-06-01-agentic-e2e-monitor.md`; harness + how-to: `apps/backend/e2e_monitor/README.md`.
- OSS-safe: harness deps are an optional extra (`uv sync --extra dev --extra e2e-monitor`), every move is gated behind `RM_E2E_MONITOR=1` + a configured key, and the runnable skill is gitignored (its source is the committed `e2e_monitor/AGENT_PLAYBOOK.md`). The dev's real SQLite DB is never touched (isolated `DATA_DIR`).
- Run: `cd apps/backend && RM_E2E_MONITOR=1 uv run python -m e2e_monitor sweep`, then `bash e2e_monitor/install_skill.sh` and invoke the `monitor-e2e` skill for the report.
