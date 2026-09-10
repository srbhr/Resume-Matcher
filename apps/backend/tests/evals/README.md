# Eval harness — "did the prompt change make tailoring _better_?"

Deterministic tests answer *"is the plumbing correct?"* They can't answer
*"did this prompt edit make the tailored resume better or worse?"* — that needs
**evals**. This directory holds the eval harness for the Resume-Matcher
backend, in two deliberately separate layers.

See [`docs/agent/testing-strategy.md`](../../../../docs/agent/testing-strategy.md)
§3 (Phase 5) for the full rationale.

---

## The two layers

### 1. Structural scorers — deterministic, free, run everywhere

Pure functions in [`scorers.py`](./scorers.py) that check invariants which must
hold no matter how the LLM worded things. **No LLM, no network, no disk.** They
form the cheap first line of defence: most "a prompt change broke something"
regressions are caught here for free.

| Scorer | What it checks |
|--------|----------------|
| `sections_preserved(original, tailored) -> bool` | No populated top-level section or individual custom section vanishes during tailoring. |
| `no_fabricated_employers(original, tailored) -> list[str]` | Company names in the tailored work history that were **not** in the original — i.e. invented employers. Empty list = truthful. |
| `jd_keywords_present(tailored, keywords) -> float` | Fraction (0–1) of the JD's keywords that actually appear (case-insensitive) in the tailored resume. |
| `is_valid_resume(data) -> bool` | The result validates against `ResumeData` and contains meaningful content. |
| `personal_info_unchanged(original, tailored) -> bool` | The candidate's identity block (`personalInfo`) is byte-for-byte unchanged. |

Their tests live in [`test_scorers.py`](./test_scorers.py) and prove **each
scorer fires on a known-bad input** (drop a section → `False`, invent a company
→ it's returned, change the name → `False`, …). That's the anti-theater proof
that the scorers detect real violations rather than always saying "OK".

### 2. LLM-as-judge — real model, scores quality, run on demand

[`test_tailoring_eval.py`](./test_tailoring_eval.py) generates a resume through the real preview pipeline for each original/JD, then sends the generated result + original evidence + JD to a **real LLM** and asks it to grade tailoring quality on a
rubric (relevance / truthfulness / formatting), returning
`{"score": 1-5, "reasons": "…"}`, then asserts `score >= 3`.

- Marked `@pytest.mark.eval` (the `eval` marker is declared in `pyproject.toml`).
- Requires explicit `RM_RUN_PAID_EVAL=1` and provider environment settings. Test data remains isolated; the suite does not import the developer's resume database or encrypted key store.
- **Skips cleanly when no key is configured** — the key check (`_needs_key()`)
  is the first line of the test, so a keyless environment never makes an
  ungated real call. It is never part of a keyless CI gate.

---

## How to run

From `apps/backend`:

```bash
# Structural scorers only — runs everywhere, no key needed, free & fast.
uv run pytest tests/evals

# Add the LLM-as-judge eval — only meaningful with a configured key.
# Skips (does not error) when no key is present.
RM_RUN_PAID_EVAL=1 uv run pytest tests/evals -m eval
```

A clean keyless run shows the scorer tests passing and the judge cases excluded by default, or **skipped** when explicitly selected without opt-in/provider settings. To actually exercise the judge, configure a provider/key (explicit provider environment settings) the same way you would to run the app,
then re-run with `-m eval`.

---

## Adding a golden fixture

Golden fixtures live in [`golden/cases.py`](./golden/cases.py) as the
`GOLDEN_CASES` list. Each entry is a plain dict:

```python
{
    "name": "short_id",
    "original": { ... },          # master resume (ResumeData-compatible)
    "job_description": "…",        # the target JD text
    "jd_keywords": ["…", "…"],     # all target keywords
    "grounded_keywords": ["…"],  # source-supported positive-fixture targets
    "tailored_good": { ... },      # faithful tailoring — passes every scorer
    "tailored_bad": { ... },       # broken tailoring — must trip the scorers
}
```

Guidelines:

- Keep `original` and `tailored_good` **valid against `ResumeData`** (so
  `is_valid_resume` stays meaningful) and make sure every `grounded_keywords` entry appears in `tailored_good` and is supported by the original. `jd_keywords` remains the complete target list; unsupported requirements need not appear in a truthful positive fixture.
- Make `tailored_bad` violate at least one invariant on purpose — drop a
  section, invent an employer, or rewrite the name — so the scorer tests keep
  proving detection works.
- Keep positive cases grounded; correct unsupported positive claims when found. The parametrized tests in
  `test_scorers.py` pick up new cases automatically.


Generation and judging can each retry according to application policy, so a paid case can make several calls. The judge uses freeform `keywords` JSON handling followed by explicit finite score normalization (1–5; booleans, junk and non-finite values fail). The normalization deliberately accepts numeric strings and rounds fractional values as the monitor did. It no longer uses the unrelated enrichment schema. Original evidence is mandatory in the shared judge prompt; JD requirements do not prove candidate experience.

Keyword scoring uses term boundaries (`Go` does not match `Google`, while `C++` and `CI/CD` work). Schema-valid empty defaults fail meaningfulness checks. Structural checks are bounded heuristics; employer-name checks alone cannot prove every narrative fact. The deterministic contract suite does not establish a real vendor ATS score or live model quality.
