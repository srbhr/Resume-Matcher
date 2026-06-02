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
| `sections_preserved(original, tailored) -> bool` | No populated top-level section (work experience, education, …) vanishes during tailoring. |
| `no_fabricated_employers(original, tailored) -> list[str]` | Company names in the tailored work history that were **not** in the original — i.e. invented employers. Empty list = truthful. |
| `jd_keywords_present(tailored, keywords) -> float` | Fraction (0–1) of the JD's keywords that actually appear (case-insensitive) in the tailored resume. |
| `is_valid_resume(data) -> bool` | The result still validates against `ResumeData`. |
| `personal_info_unchanged(original, tailored) -> bool` | The candidate's identity block (`personalInfo`) is byte-for-byte unchanged. |

Their tests live in [`test_scorers.py`](./test_scorers.py) and prove **each
scorer fires on a known-bad input** (drop a section → `False`, invent a company
→ it's returned, change the name → `False`, …). That's the anti-theater proof
that the scorers detect real violations rather than always saying "OK".

### 2. LLM-as-judge — real model, scores quality, run on demand

[`test_tailoring_eval.py`](./test_tailoring_eval.py) sends a golden tailored
resume + its JD to a **real LLM** and asks it to grade tailoring quality on a
rubric (relevance / truthfulness / formatting), returning
`{"score": 1-5, "reasons": "…"}`, then asserts `score >= 3`.

- Marked `@pytest.mark.eval` (the `eval` marker is declared in `pyproject.toml`).
- Uses the **developer's own configured key/provider** via `app.llm`.
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
uv run pytest tests/evals -m eval
```

A clean keyless run shows the scorer tests passing and the one judge test
**skipped**. To actually exercise the judge, configure a provider/key (env or
the Settings UI → `data/config.json`) the same way you would to run the app,
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
    "jd_keywords": ["…", "…"],     # keywords the tailoring should surface
    "tailored_good": { ... },      # faithful tailoring — passes every scorer
    "tailored_bad": { ... },       # broken tailoring — must trip the scorers
}
```

Guidelines:

- Keep `original` and `tailored_good` **valid against `ResumeData`** (so
  `is_valid_resume` stays meaningful) and make sure every `jd_keywords` entry
  truly appears in `tailored_good` (the structural test asserts a perfect 1.0).
- Make `tailored_bad` violate at least one invariant on purpose — drop a
  section, invent an employer, or rewrite the name — so the scorer tests keep
  proving detection works.
- Append; don't rewrite existing cases. The parametrized tests in
  `test_scorers.py` pick up new cases automatically.
