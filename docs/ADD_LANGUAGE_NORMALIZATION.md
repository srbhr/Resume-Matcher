# Guide: Adding a New Language Normalization

Purpose: Extend deterministic text normalization so matching is robust across languages and orthographic variants. Follow existing German (de) implementation as a reference.

Where to add code
- Backend module: `apps/backend/app/text/normalization.py`
- Matching integration: `apps/backend/app/services/matching_service.py` (tokenization/keyword paths call normalize helpers)
- Tests: `apps/backend/tests/` (unit for normalization + E2E harness via `apps/backend/scripts/e2e_full_flow.py`)

Normalization contract
- Input: raw string text
- Output: list of normalized tokens OR normalized whole string depending on helper
- Goals:
  - NFKC + lowercase
  - Punctuation/diacritics handling per language
  - Synonym/lemma conflation for job/resume keywords
  - Optional stemming where it improves recall (language‑aware)
  - Safe for PII: do not leak input into logs

Steps to add a new language (e.g., Spanish “es”)
1) Define language code and entrypoints
	- In `normalization.py`, add:
	  - `normalize_text_es_block(text: str) -> str`
	  - `normalize_tokens_es(tokens: list[str]) -> list[str]`
	- Mirror the structure used for `*_de_*` functions.

2) Unicode + casefold
	- Apply `unicodedata.normalize('NFKC', text).casefold()`.

3) Diacritics strategy
	- For languages with accents (es, fr, pt), provide two modes:
	  - Preserve base letters for token matching: strip accents via `unicodedata.category(c) != 'Mn'` after `normalize('NFKD')`.
	  - Keep original for display; only matching layer uses stripped tokens.

4) Tokenization
	- Split with a conservative regex that keeps letters/numbers: `re.findall(r"[\p{L}\p{N}]+", text, flags=regex.UNICODE)` using `regex` package, or use existing project helper if present.

5) Synonyms and keyword conflation
	- Add a small curated dict per language, e.g. for es:
	  - {"currículum": ["cv", "resumen"], "conocimientos": ["habilidades"], "python": ["py"], ...}
	- Apply map→base form; de‑dup the token list.
	- Keep this curated list minimal, focused on resume/job domain.

6) Whitelist of technical terms
	- Maintain a small set of tech brand terms to avoid over‑stemming (e.g., "kubernetes", "fastapi", "postgresql").
	- Skip stemming for whitelisted tokens.

7) Stemming or lemmatization
	- Prefer lightweight stemming via Snowball where available (e.g., `nltk.stem.snowball.SpanishStemmer`).
	- Do not introduce heavy NLP pipelines. Keep deterministic and fast.

8) Expose in normalization router
	- Add language code selection in any helper that switches by locale, or call the new functions directly from matching.

9) Wire into matching
	- In `matching_service.py`, ensure resume, job, and keyword token flows call the right language helper when the locale is detected or configured.
	- Default can remain English; add a simple language hint param if needed.

10) Tests
	- Unit tests: create `tests/text/test_normalization_es.py` with cases:
	  - Accents: "Programación" → "programacion"
	  - Synonym conflation: "cv" → "curriculum"
	  - Stemming boundary: tech whitelist not stemmed ("kubernetes" stays)
	- E2E smoke: use `scripts/e2e_full_flow.py` with an es fixture pair; verify matching score is non‑zero and stable.

Performance & safety
- Keep normalization O(n) over text size; avoid model calls.
- No logging of full raw text; trim previews in scripts.
- Avoid excessive regex backtracking; precompile patterns.

Checklist for a new language
- [ ] Helpers added in `normalization.py`
- [ ] Synonym map and whitelist defined
- [ ] Stemming integrated and gated by whitelist
- [ ] Matching service calls the new helpers
- [ ] Unit tests added and passing
- [ ] E2E fixtures created and verified
- [ ] Docs updated with examples

Example skeleton (normalization.py)
"""
def normalize_text_es_block(text: str) -> str:
	 t = _nfkc_lower(text)
	 t = _strip_diacritics(t)
	 return t

def normalize_tokens_es(tokens: list[str]) -> list[str]:
	 out: list[str] = []
	 for tok in tokens:
		  base = _synonym_map_es.get(tok, tok)
		  if base in _whitelist_es:
				out.append(base)
				continue
		  out.append(_stem_es(base))
	 return _dedupe(out)
"""

Notes
- Keep synonym lists and whitelists short and auditable.
- If unsure about stemming quality, disable it first; add later with tests.
- Report language code through metrics if you introduce language switching at runtime.
