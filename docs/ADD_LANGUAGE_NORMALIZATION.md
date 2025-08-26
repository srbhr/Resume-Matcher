# Language Enablement Guide: Adding a New Locale (Normalization, Labels, Prompts)

Purpose: Make matching and improvement robust across languages by adding fast, deterministic normalization plus locale‑aware labels/prompts. Use the existing German (de) path as a reference and keep changes minimal, testable, and safe for PII.

Scope of work
- Backend text normalization (deterministic, no model calls)
- Label/section detection for resumes (locale synonyms)
- Optional locale‑specific improvement prompt
- Tests (unit + E2E smoke)
- Documentation and safe rollout

Key touch points in the repo
- Normalization: `apps/backend/app/text/normalization.py`
- Matching integration: `apps/backend/app/services/matching_service.py`
- Improvement service (labels/weaving): `apps/backend/app/services/score_improvement_service.py`
- Prompt(s): `apps/backend/app/prompt/` (e.g., `resume_improvement.py` via `prompt_factory`)
- Locale‑agnostic labels and flags: `apps/backend/app/core/config.py`
- E2E harness: `apps/backend/scripts/e2e_full_flow.py`
- Tests: `apps/backend/tests/`

Normalization contract (must‑haves)
- Input: raw resume/job text (str) or tokens (list[str])
- Output: normalized string or tokens (deterministic)
- Requirements:
  - NFKC normalization + casefold
  - Accent/diacritics handling per language
  - Synonym/lemma conflation for resume/matching terms
  - Optional stemming (Snowball) gated by a tech whitelist
  - No PII logging; helpers must be pure and side‑effect free

Step‑by‑step: Add a new language (example: Spanish “es”)
1) Add normalization helpers
	- Create `normalize_text_es_block(text: str) -> str` and `normalize_tokens_es(tokens: list[str]) -> list[str>` in `normalization.py`.
	- Mirror the shape of existing de/EN helpers.

2) Unicode and casefold
	- Apply `unicodedata.normalize('NFKC', text).casefold()` as the first step for consistent casing.

3) Diacritics policy
	- For es/fr/pt, strip accents for matching while preserving originals for display.
	- Implementation: NFKD split + drop characters with category `Mn`.

4) Tokenization
	- Use a conservative, Unicode‑aware tokenizer. Preferred pattern (via `regex` lib):
	  - `regex.findall(r"[\p{L}\p{N}]+", text)`
	- Or reuse any existing tokenizer helper in the project.

5) Synonym/keyword conflation (keep small and auditable)
	- Add a curated map per language, e.g. (es):
	  - `{ "currículum": ["cv", "resumen"], "conocimientos": ["habilidades"], "python": ["py"] }`
	- Normalize tokens to a base form using the map; deduplicate.

6) Tech whitelist (do not stem brand terms)
	- Maintain a small set: e.g., `{"kubernetes", "fastapi", "postgresql", "graphql"}`.
	- Skip stemming for these tokens.

7) Optional stemming/lemmatization
	- Prefer Snowball stemming (e.g., `nltk.stem.snowball.SpanishStemmer`).
	- Keep it deterministic and fast; avoid heavy NLP pipelines.

8) Expose selection (locale → helper)
	- If a generic `normalize(locale, ...)` switch exists, register `"es"`.
	- Otherwise, call your new helpers explicitly from matching based on a language hint.

9) Wire into matching
	- In `matching_service.py`, ensure that resume text, job text, and keyword token flows use your locale’s helpers when the locale is detected or configured.
	- Keep English as safe default; accept a language hint parameter when available.

10) Labels and section detection (config‑driven)
	- Update `apps/backend/app/core/config.py` to include your language in section header synonyms so detection works regardless of output language:
	  - `RESUME_HEADERS_SKILLS`: add e.g., "Habilidades"
	  - `RESUME_HEADERS_PROFILE`: add e.g., "Perfil"
	  - `RESUME_HEADERS_EXPERIENCE`: add e.g., "Experiencia"
	- If you want the output label for the “Core Technologies” line localized, set `RESUME_CORE_TECH_LABEL` via environment (.env) for the deployment handling that locale (e.g., `RESUME_CORE_TECH_LABEL=Competencias`).

11) Prompt integration (optional, if you want locale‑specific improvement output)
	- Add a locale‑specific prompt variant under `app/prompt/` or parameterize the existing prompt template to instruct the model to output in your language.
	- Route selection via `prompt_factory` or a small switch in the service (keep it minimal and explicit).

12) Tests
	- Unit tests (new file): `apps/backend/tests/text/test_normalization_es.py`
	  - Accents: `"Programación" → "programacion"`
	  - Synonyms: `"cv" → "curriculum"`
	  - Whitelist: `"kubernetes"` not stemmed
	  - Performance: large input runs in linear time
	- E2E smoke:
	  - Create Spanish fixtures (`apps/backend/scripts/fixtures/spanish_resume.md`, `spanish_job.md`).
	  - Use `apps/backend/scripts/e2e_full_flow.py` to seed these fixtures (either temporarily swapping the fixture paths in the script or calling the API directly) and verify:
		 - non‑zero match score
		 - improvement endpoint returns 200
		 - metrics endpoint shows token/embedding accounting

13) Security & PII
	- Never log raw resume/job texts; trim previews in any script outputs.
	- Keep synonym maps small and audited; don’t embed sensitive terms.

14) Performance
	- Keep normalization O(n) with precompiled regexes.
	- Avoid model calls and heavy NLP.

15) Rollout
	- Ship normalization + tests first.
	- Add config label synonyms via env or code default, and verify detection.
	- Optionally enable locale prompt after normalization is stable.

Quick checklist
- [ ] Helpers added in `normalization.py`
- [ ] Synonym map and whitelist defined
- [ ] Stemming integrated and gated by whitelist
- [ ] Matching calls the new helpers for the target locale
- [ ] Config labels updated (skills/profile/experience + optional core label)
- [ ] Unit tests added and passing
- [ ] E2E smoke with locale fixtures verified
- [ ] Documentation updated

Example: Spanish (es)
Minimal helper skeleton (in `normalization.py`):

"""
def normalize_text_es_block(text: str) -> str:
	 t = _nfkc_lower(text)
	 t = _strip_diacritics(t)
	 return t

_SYN_ES: dict[str, str] = {
	 # map variant → base
	 "cv": "curriculum",
	 "currículum": "curriculum",
	 "resumen": "curriculum",
	 "habilidades": "conocimientos",
}
_WHITELIST_ES: set[str] = {"kubernetes", "fastapi", "postgresql", "grafana"}

def normalize_tokens_es(tokens: list[str]) -> list[str]:
	 out: list[str] = []
	 for tok in tokens:
		  base = _SYN_ES.get(tok, tok)
		  if base in _WHITELIST_ES:
				out.append(base)
				continue
		  out.append(_stem_es(base))  # Snowball or no‑op
	 return _dedupe(out)
"""

Suggested config updates (optional, for section detection & labels):
- `RESUME_HEADERS_SKILLS += ["Habilidades"]`
- `RESUME_HEADERS_PROFILE += ["Perfil"]`
- `RESUME_HEADERS_EXPERIENCE += ["Experiencia"]`
- For Spanish output line label: set `RESUME_CORE_TECH_LABEL=Competencias` via environment.

How to validate (Windows PowerShell)

```powershell
# 1) Run unit tests (after adding your test file)
& ./env/Scripts/Activate.ps1
pytest -q apps/backend/tests/text/test_normalization_es.py

# 2) E2E smoke (option A): use existing script and temporarily point it to your Spanish fixtures
python apps/backend/scripts/e2e_full_flow.py --repeats 1

# 3) E2E smoke (option B): call the API locally with your seeded resume/job IDs
# Upload or seed your Spanish resume and job, then:
python apps/backend/scripts/e2e_full_flow.py --repeats 1 --max-rounds 2
```

Troubleshooting
- 422 validation on improve: ensure request body contains valid `resume_id`/`job_id` and any numeric query params are in accepted ranges.
- No uplift: increase `IMPROVE_MAX_ROUNDS` and/or adjust `IMPROVE_TEMPERATURE_SWEEP` in `config.py`.
- Section not detected: confirm your language’s header synonyms are present in `RESUME_HEADERS_*`.
- Slow normalization: precompile regex and avoid backtracking; keep maps small.

Notes
- Keep synonym lists and whitelists short and auditable.
- If unsure about stemming quality, disable it first; add later with tests.
- If you introduce runtime language switching, consider tagging metrics with the `locale` used.
