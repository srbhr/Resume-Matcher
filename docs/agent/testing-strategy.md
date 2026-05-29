# Testing Strategy & Verification Plan

> **Status:** Living document. Started 2026-05-30 on branch `test/backend-coverage-foundation` (base: `dev`).
> **Scope of phase 1:** Backend (`apps/backend`). Frontend and CI follow in later, separately-agreed phases.
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
| `database.py` (TinyDB) | 34% | 🔴 Real DB never exercised — every integration test mocks `db` |
| `services/cover_letter.py` | 26% | 🔴 Untested |
| `services/parser.py` | 20% | 🔴 Upload→markdown→JSON untested; even the pure date-restore is uncovered |
| `pdf.py` (render) | 20% | 🔴 The "resume won't render" class |
| `routers/resumes.py` | 18% | 🔴 Biggest file (1,796 LOC): tailor + PDF + CRUD — almost entirely untested |

### 2.3 The structural truth about the integration tests

Every `tests/integration/*` test patches `app.routers.<x>.db` and the LLM/parse calls. They verify **status codes, request validation, response shape, and router branch logic** (e.g. API-key masking, regenerate fallback matching). They are valuable *contract* tests. They do **not** prove TinyDB persists, Playwright renders, markitdown parses, or any provider (Ollama included) actually responds.

---

## 3. The framework decision

**Keep `pytest` + `pytest-asyncio` + `httpx`.** It is correctly configured (`asyncio_mode=auto`, strict markers, `unit`/`service`/`integration` markers). Add, incrementally:

| Need | Tool | Why |
|---|---|---|
| Coverage as a tracked number | `pytest-cov` | Quantify gaps & deltas; stop guessing |
| Real `llm.py` against a fake provider (incl. Ollama) | `respx` (or `pytest-httpx`) | Mock at the HTTP transport so our actual routing/normalization code runs — the only way to regression-test "Ollama doesn't work" |
| PDF render proof | Playwright (already a dep) | One smoke test → real PDF bytes from the print route |
| Prompt/skill quality | In-repo **eval harness** | Golden fixtures + structural scorers + optional LLM-as-judge |
| Build/route/lint gate | GitHub Actions | **Deferred** — see §7 |

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

**Phase 1 — Foundation + cheap deterministic coverage (this branch → `dev`)**
- ✅ Audit + this document
- 🚧 Make the suite green (fix stale `health` tests; liveness vs readiness)
- 🚧 `llm.py` provider/Ollama pure-function regression tests
- 🚧 `parser.py` pure tests (date restoration) + empty-text rejection
- 🚧 Real-TinyDB `database.py` CRUD tests
- ⬜ Verify: green suite + coverage delta recorded

**Phase 2 — Transport contract tests (LLM/Ollama)**
- ⬜ `respx`-backed tests: real `complete` / `complete_json` / `check_llm_health` against a fake Ollama + OpenAI-compatible server (request shape, base-URL handling, thinking-tag stripping, JSON-mode fallback, error-code mapping)

**Phase 3 — Render safety net**
- ⬜ Playwright PDF smoke test (print route → non-empty valid PDF) + error-path mapping in `pdf.py`

**Phase 4 — End-to-end pipeline**
- ⬜ One e2e: upload → parse → tailor → render with a mocked LLM, exercising real routers + real DB

**Phase 5 — Eval harness (structural + LLM-as-judge)**
- ⬜ Golden fixtures + structural scorers (run in normal suite)
- ⬜ LLM-as-judge using the **developer's own configured key**, gated/skipped when no key is present; nightly/on-demand only

**Phase 6 — CI (separate sign-off)**
- ⬜ GitHub Actions PR gate: backend `pytest`, frontend `tsc`/`build`/lint, structural evals. (Deferred per §7.)

---

## 6. How to run

```bash
cd apps/backend

# Full suite
uv run pytest

# Quiet + coverage (ephemeral plugin, no pyproject change)
uv run --with pytest-cov pytest -q --cov=app --cov-report=term-missing

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

---

## 8. Open questions / future

- Frontend: add a locale-parity test (every `messages/*.json` structurally matches `en.json`) — this *exactly* reproduces and prevents the build break that started this effort. Belongs to the frontend phase.
- Decide coverage floors per module once Phase 1–4 land (avoid a single global % that hides the I/O gaps).
- When CI lands, structural evals run in-gate; LLM-judge evals run nightly with a repo secret or skip.
