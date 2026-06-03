# CLAUDE.md - Backend (`apps/backend`)

> FastAPI backend for Resume Matcher. This file goes **deeper on the backend**.
> For project-wide context see the root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) and [`docs/agent/README.md`](../../docs/agent/README.md).

Stack: FastAPI 0.128 · Python **3.13+** · Pydantic v2 / pydantic-settings · SQLAlchemy 2 (async) + SQLite (`aiosqlite`) · LiteLLM (multi-provider AI) · markitdown (DOCX/PDF→Markdown) · Playwright/Chromium (PDF). Managed with **uv** (`pyproject.toml`, version `1.2.0`).

---

## Architecture / Module Map

| Module | Responsibility | Key files |
|--------|----------------|-----------|
| Entry / wiring | App, lifespan, CORS, router mounting (all under `/api/v1`) | `app/main.py` |
| Settings | Env vars via `pydantic-settings`; `settings` singleton; API keys read from the encrypted SQLite store | `app/config.py` |
| Crypto | Fernet encrypt/decrypt for API keys at rest (`data/.secret_key`, `chmod 600`, gitignored) | `app/crypto.py` |
| Config cache | Shared, TTL-cached (5 min) read of `data/config.json`; `get_content_language()` | `app/config_cache.py` |
| Database | Async SQLAlchemy/SQLite facade; tables `resumes`/`jobs`/`improvements`/`applications`/`api_keys`; returns plain dicts; global `db` singleton | `app/database.py`, `app/models.py`, `app/db_engine.py` |
| Tracker | Kanban application-tracker endpoints | `app/routers/applications.py`, `app/schemas/applications.py` |
| LLM | LiteLLM wrapper: Router, retries, JSON extraction, timeouts, provider quirks | `app/llm.py` |
| PDF | Headless Chromium render of frontend `/print/*` pages; lazy browser init | `app/pdf.py` |
| Routers | HTTP endpoints (see below) | `app/routers/*.py` |
| Services | Business logic (parse, improve/diff, refine, cover-letter) | `app/services/*.py` |
| Prompts | All LLM prompt templates + placeholder validation | `app/prompts/*.py` |
| Schemas | Pydantic request/response + `ResumeData` models | `app/schemas/*.py` |

`data/` holds `resume_matcher.db` (SQLite; primary store), `config.json` (non-secret config), `.secret_key` (Fernet secret for encrypted API keys), an `uploads/` dir, and possibly a legacy `database.json` (TinyDB — imported into SQLite on first startup, then renamed `database.json.migrated`). `.gitignore` ignores `*.db*`, `data/*.json`, and `data/.secret_key` (DB + config + secret never get committed), but **`uploads/` is NOT git-ignored** — don't commit user uploads. `db.reset_database()` truncates the document tables + `applications` (preserving `api_keys`) and wipes `uploads/`.

### Routers (all prefixed `/api/v1`)
- `health.py` — `GET /health` (liveness, no LLM call), `GET /status` (LLM health + DB stats).
- `config.py` — `/config/llm-api-key` (GET/PUT), `/config/llm-test` (POST live health check), `/config/features`, `/config/language`, `/config/prompts`, `/config/feature-prompts`, `/config/api-keys` (per-provider CRUD), `/config/reset` (POST; confirmation token `{"confirm": "RESET_ALL_DATA"}` in the JSON **body**, not a query param).
- `resumes.py` — the biggest router: `/resumes/upload`, `GET /resumes`, `/resumes/list`, `/resumes/improve` + `/improve/preview` + `/improve/confirm`, `PATCH /resumes/{id}`, `/{id}/pdf`, `/{id}/retry-processing`, cover-letter/outreach/title PATCH + on-demand generate, `/{id}/job-description`, `/{id}/cover-letter/pdf`.
- `jobs.py` — `/jobs/upload` (batch JD text → job_ids), `GET /jobs/{id}`.
- `enrichment.py` — `/enrichment/analyze/{id}`, `/enhance`, `/apply/{id}`, `/regenerate`, `/apply-regenerated/{id}`.

### Services
- `parser.py` — `parse_document` (markitdown bytes→Markdown), `parse_resume_to_json` (LLM→`ResumeData`), `restore_dates_from_markdown` (re-inserts months the LLM drops).
- `improver.py` (largest) — keyword extraction, **diff-based** improvement (`generate_resume_diffs` → `apply_diffs` with path allow/block-lists → `verify_diff_result`), skill-target planning (`generate_skill_target_plan`/`verify_skill_target_plan`), legacy full-output `improve_resume`, `calculate_resume_diff`. Sanitizes prompt-injection patterns in user input.
- `refiner.py` — multi-pass polish: keyword injection (LLM), AI-phrase removal (local, via `refinement.py` blacklist), master-alignment validation. Driven by `RefinementConfig`.
- `cover_letter.py` — `generate_cover_letter`, `generate_outreach_message`, `generate_resume_title`; resolves custom-vs-default feature prompts at runtime.

---

## Request / Data Flow (improve = core pipeline)

`POST /resumes/improve/preview` is the canonical path:
1. Load resume + job from `db`; resolve content language (`config_cache`) and `prompt_id`.
2. `extract_job_keywords(jd)` (LLM, cached on the job by content hash).
3. If structured `processed_data` exists → **diff mode**: skill-target plan → `generate_resume_diffs` → `apply_diffs` → `verify_diff_result`. Else → fallback `improve_resume` (full-output).
4. **Local safety nets** (always run, defense-in-depth): `_preserve_personal_info`, `_restore_original_dates`, `restore_dates_from_markdown`, `_preserve_original_skills`, `_protect_custom_sections`.
5. `refine_resume` (keyword injection + AI-phrase scrub + alignment check).
6. Persist a `preview_hash` on the job. `/improve/confirm` re-validates that hash (and that `personalInfo` is unchanged) before persisting the tailored resume + an `improvements` record.

Routers call services; services call `app/llm.py`; persistence goes through the `db` singleton. The whole preview is wrapped in a 240s `asyncio.wait_for`.

---

## Prompt Management (read this before touching prompts)

Prompts are **plain Python string constants** — no Jinja, no external prompt files at runtime (`data/prompts.json` is *not* loaded by the app code paths reviewed). Layout:

| File | Holds |
|------|-------|
| `app/prompts/templates.py` | Resume parse, keyword extraction, the 3 improve variants, diff prompt, skill-target plan, cover-letter / outreach / title, `RESUME_SCHEMA_EXAMPLE`, `CRITICAL_TRUTHFULNESS_RULES`, `LANGUAGE_NAMES` + `get_language_name()` |
| `app/prompts/enrichment.py` | `ANALYZE_RESUME_PROMPT`, `ENHANCE_DESCRIPTION_PROMPT`, `REGENERATE_ITEM_PROMPT`, `REGENERATE_SKILLS_PROMPT` |
| `app/prompts/refinement.py` | `KEYWORD_INJECTION_PROMPT`, `VALIDATION_POLISH_PROMPT`, `AI_PHRASE_BLACKLIST`, `AI_PHRASE_REPLACEMENTS` |
| `app/prompts/__init__.py` | Re-exports template constants; placeholder validation |

**Loading / parameterization:** services `from app.prompts import ...` then call `PROMPT.format(**vars)`. So `{placeholder}` = a real format key, and any *literal* `{}` (e.g. JSON examples) **must be doubled `{{ }}`** — see `EXTRACT_KEYWORDS_PROMPT`, `DIFF_IMPROVE_PROMPT`, the enrichment prompts. `PARSE_RESUME_PROMPT` is the exception: it embeds the schema via `{schema}` so it does *not* double-brace.

**Improve prompt selection:** `IMPROVE_RESUME_PROMPTS` = `{nudge, keywords, full}`; `IMPROVE_PROMPT_OPTIONS` is the UI list; `DEFAULT_IMPROVE_PROMPT_ID = "keywords"`. The active id comes from `config.json` `default_prompt_id` (validated against option ids) or the request's `prompt_id`. `CRITICAL_TRUTHFULNESS_RULES[id]` is injected into each improve prompt via `{critical_truthfulness_rules}`.

**Custom feature prompts (user-editable):** cover-letter & outreach prompts can be overridden in `config.json` (`cover_letter_prompt`, `outreach_message_prompt`). On save (`PUT /config/feature-prompts`) they are validated by `validate_prompt_placeholders()` to contain all of `REQUIRED_FEATURE_PROMPT_PLACEHOLDERS` = `{job_description}`, `{resume_data}`, `{output_language}`; missing → HTTP 422. Empty string = "use default". At runtime `cover_letter.py::_resolve_feature_prompt` picks custom-or-default and falls back to the built-in default (with a warning) if a custom prompt fails `.format()`.

**Language:** every generative prompt takes `{output_language}` (full name from `get_language_name(code)`), so all output is produced in the configured content language (`en`/`es`/`zh`/`ja`/`pt`).

---

## LLM Integration (`app/llm.py`)

- **Provider abstraction:** LiteLLM. Providers: `openai`, `openai_compatible` (llama.cpp/vLLM/LM Studio), `anthropic`, `openrouter`, `gemini`, `deepseek`, `groq`, `ollama`. `get_model_name()` maps provider→LiteLLM prefix; `_normalize_api_base()` fixes `/v1/v1` duplication per provider.
- **Router:** a cached `litellm.Router` (`get_router`) rebuilt only when a config fingerprint changes. `num_retries=3` with a `RetryPolicy` (auth/bad-request/content-policy = 0 retries; timeout/500 = 2; rate-limit = 3). Cooldowns disabled (single deployment). **Transport retries live in the Router; do not re-retry them in callers.**
- **`complete()` / `complete_json()`:** `complete_json` adds app-level *content-quality* retries (malformed JSON, truncation) with temperature escalation and a JSON-mode→prompt-only fallback. JSON is parsed by the brace-balancing `_extract_json`; `_appears_truncated` is `schema_type`-aware (`resume`/`enrichment`/`diff`/`keywords`).
- **Capabilities via registry, not hardcoded:** `_supports_json_mode`, `_supports_temperature`, `get_safe_max_tokens` query `litellm.get_model_info` (with Ollama/local fallbacks). `litellm.drop_params = True` lets unsupported params (e.g. `reasoning_effort`) be dropped silently.
- **Timeouts:** adaptive (`_calculate_timeout`): base 30s health / 120s completion / 180s JSON, scaled by token count and a provider factor (ollama 2x, openrouter 1.5x...).
- **Reasoning models:** `<think>` tags stripped; `reasoning_content`/`thinking` used as content fallback. gpt-5 configs auto-migrate to `reasoning_effort="minimal"` once.
- **Key resolution:** single source of truth is `resolve_api_key(stored, provider)`. `openai_compatible`/`ollama` deliberately **skip** the env-level `LLM_API_KEY` fallback so a paid key can't leak to a local server. Error text is scrubbed of key-like tokens (`_scrub_secrets`) before reaching clients.
- API keys are passed directly to LiteLLM calls (never via `os.environ`) to avoid async races.

---

## Essential Commands

```bash
cd apps/backend
uv sync                                              # install deps (creates .venv)
uv run uvicorn app.main:app --reload --port 8000     # dev server on :8000
uv run app                                           # console script (app.main:main, uses HOST/PORT/RELOAD)
uv run playwright install chromium                   # one-time, required for PDF endpoints
```
Config via `.env` (see `.env.example`). Interactive API docs at `/docs`.

---

## Non-Negotiable Backend Rules

1. **Type hints on every function** (params + return), incl. helpers.
2. **Log details server-side, return generic client messages.** Pattern:
   ```python
   except Exception as e:
       logger.error(f"Operation failed: {e}")
       raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
   ```
3. **`copy.deepcopy()` for any mutable default / before mutating shared/cached data** (e.g. `config_cache.load_config` returns a deep copy; the resume safety-net helpers deepcopy before editing).
4. New endpoints mount under `/api/v1` via `app/routers/__init__.py`.
5. Schema/prompt changes must be reflected in the relevant `docs/agent/` doc.

---

## Key Gotchas

- **uv.lock is gitignored** (`.gitignore`), so dependency resolution isn't reproducible from VCS — rely on the exact pins in `pyproject.toml` / `requirements.txt`.
- **litellm ↔ python-dotenv trap:** litellm `<1.84.0` hard-pinned `python-dotenv==1.0.1`, which used to fight other pins. Resolved at the current pins (`litellm==1.86.2`, `python-dotenv==1.2.2`); do **not** downgrade litellm below 1.84 without re-checking dotenv.
- **Keys vs non-secret config:** API **keys** live ONLY in the encrypted `api_keys` SQLite table (per-provider, via `_PROVIDER_KEY_MAP`); `load_config_file()` injects the decrypted keys into the returned dict and `save_config_file()` strips them, so secrets never round-trip to `config.json`. Non-secret provider/model/base/features stay in `config.json`. `PUT /config/llm-api-key` no longer writes any key; keys go through `PUT /config/api-keys`. `migrate_legacy_keys()` folds any legacy plaintext keys into the encrypted store (idempotent, non-clobbering). After any write to `config.json`, call `invalidate_config_cache()`.
- **Master resume invariant:** exactly one resume has `is_master=True`. Concurrent uploads use `create_resume_atomic_master` (an `asyncio.Lock`, not threading) and auto-promote if the current master is stuck `failed`/`processing`.
- **Dates lose months:** LLMs drop month precision; `restore_dates_from_markdown` + `_restore_original_dates` re-insert them. Preserve this when editing the parse/improve flow.
- **Single-worker assumption:** caches and locks assume one uvicorn worker / cooperative async. Don't add cross-worker shared mutable state without revisiting `config_cache` and the master lock.
- **PDF needs the frontend running** (`FRONTEND_BASE_URL`, default `http://localhost:3000`) — Chromium renders `/print/*` pages. Browser is lazily initialized on first PDF request.
- **Improve/confirm requires a prior preview** — it validates `preview_hash`; arbitrary payloads are rejected (400).

---

## Documentation by Task

| Topic | Doc |
|-------|-----|
| Project orientation | [`docs/agent/README.md`](../../docs/agent/README.md) |
| Backend architecture / modules | [`backend-guide.md`](../../docs/agent/architecture/backend-guide.md) · [`backend-architecture.md`](../../docs/agent/architecture/backend-architecture.md) |
| LLM / multi-provider | [`llm-integration.md`](../../docs/agent/llm-integration.md) |
| Prompt pipeline (diff/retry design) | [`prompt-workflow-design.md`](../../docs/agent/architecture/prompt-workflow-design.md) |
| API contracts | [`apis/front-end-apis.md`](../../docs/agent/apis/front-end-apis.md) · [`apis/api-flow-maps.md`](../../docs/agent/apis/api-flow-maps.md) · [`apis/backend-requirements.md`](../../docs/agent/apis/backend-requirements.md) |
| Coding standards | [`coding-standards.md`](../../docs/agent/coding-standards.md) |
| Scope / principles | [`scope-and-principles.md`](../../docs/agent/scope-and-principles.md) · [`workflow.md`](../../docs/agent/workflow.md) |
| AI enrichment | [`features/enrichment.md`](../../docs/agent/features/enrichment.md) |
| JD matching | [`features/jd-match.md`](../../docs/agent/features/jd-match.md) |
| Custom sections | [`features/custom-sections.md`](../../docs/agent/features/custom-sections.md) |
| i18n | [`features/i18n.md`](../../docs/agent/features/i18n.md) |
| PDF / templates | [`design/pdf-template-guide.md`](../../docs/agent/design/pdf-template-guide.md) · [`design/template-system.md`](../../docs/agent/design/template-system.md) |

---

## Testing

**Tests are in scope** (deliberate testing initiative — see [`testing-strategy.md`](../../docs/agent/testing-strategy.md) for the full assessment + roadmap). Stack: pytest + pytest-asyncio + httpx + respx; config in `[tool.pytest.ini_options]`. Run `uv run pytest` (the LLM-judge evals are excluded by default via `addopts -m "not eval"`). Coverage: `uv run --with pytest-cov pytest --cov=app --cov-report=term-missing` (ephemeral plugin, no pyproject change).

Layout (`apps/backend/tests/`):

| Dir | What | Notes |
|-----|------|-------|
| `unit/` | pure functions | diffs, `llm` provider/key helpers, parser date-restore, real-SQLite CRUD |
| `service/` | service layer, **LLM mocked** | improver diff flow, prompt construction |
| `integration/` | endpoints via httpx `ASGITransport` | config/health/jobs/resume/upload, plus `test_llm_contract.py` (real `llm.py` over `respx`) and `test_pipeline_e2e.py` (upload→tailor→render, real routers + real temp DB) |
| `evals/` | prompt quality | pure structural scorers (always run) + a gated LLM-judge (`@pytest.mark.eval`, uses the dev's own key; run with `uv run pytest -m eval`) |

Key fixtures/tools: `conftest.py::isolated_db` swaps the global `db` singleton for a disposable temp-file SQLite database across **all** router modules (for real-DB endpoint/e2e tests); `respx` mocks the HTTP transport so `llm.py`'s real routing runs against a fake Ollama / OpenAI server (gotcha: litellm 1.86 needs `disable_aiohttp_transport=True` for respx to intercept). Keep every test **anti-theater** — it must fail when its target breaks.

**Local push gate:** `.githooks/pre-push` runs this suite + a locale-parity check and blocks red pushes (`git config core.hooksPath .githooks`; see [`.githooks/README.md`](../../.githooks/README.md)). We avoid a GitHub Actions PR gate (high external-PR volume).

## Out of Scope

Without an explicit request: `.github/workflows/`, CI/CD, Docker behavior, and **removing/disabling existing tests** (adding/fixing tests is encouraged).
