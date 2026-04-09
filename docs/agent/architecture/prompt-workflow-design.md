# Prompt Workflow Design: Deviation Detection & Retry

> **Status**: Superseded by [diff-based improvement design](../../superpowers/specs/2026-03-23-diff-based-improvement-design.md)
> **Scope**: Backend improvement pipeline — `improver.py`, `refiner.py`, `llm.py`, `enrichment.py`

---

## Problem Statement

The current resume improvement pipeline has **no content-quality retry**. The LLM can produce structurally valid JSON that deviates significantly from the original resume — dropping entries, inflating word count, fabricating skills — and it passes straight through to refinement.

### What exists today

```
extract_keywords() ─→ improve_resume() ─→ 6 safety nets ─→ refine_resume() ─→ diff + aux
     LLM #1               LLM #2            (local)          LLM #3           LLM #4-6
```

**Retries that exist (in `llm.py:complete_json`):**
- Malformed JSON → retry with hint "Output ONLY valid JSON"
- Truncated output (empty arrays) → retry with hint "Output COMPLETE JSON"
- Empty response → retry
- Temperature escalation per retry (0.1 → 0.3 → 0.5 → 0.7)

**What's missing:**
- No check that the LLM's output is faithful to the original resume
- No check that section counts are preserved (work entries, education, projects)
- No check that word count hasn't exploded (over-elaboration)
- No check that new skills come from the JD, not invented
- No retry mechanism for content deviation — only for structural failures

### Where deviation hurts

| Deviation type | Current detection | When caught | Cost |
|----------------|-------------------|-------------|------|
| Dropped work entry | None | User notices in preview | Trust loss |
| Fabricated skill | `validate_master_alignment` in refiner | After improve, during refine | Removed silently, wastes LLM call |
| Word count doubled | None | Never | Over-elaborated resume |
| personalInfo in output | `_preserve_personal_info` patches it | After improve | Patched, not prevented |
| Dates lost | `_restore_original_dates` patches it | After improve | Patched, not prevented |

The safety nets in `resumes.py` (lines 750-763) **patch** the output after the fact. They don't feed back to the LLM to produce a better result. The refiner catches fabrications but **removes** them instead of asking the LLM to try again.

---

## Design: Deviation Evaluator + Retry Loop

### Architecture

Insert a **local evaluator** between `improve_resume()` and the safety nets. If the evaluator detects deviation beyond thresholds, retry the LLM call with specific feedback. Max 1 retry (total 2 attempts) to avoid latency explosion.

```
                                    ┌─────────────────────┐
                                    │  retry with feedback │
                                    │  (max 1 retry)       │
                                    └────────┬────────────┘
                                             │
                                             ▼
extract_keywords ──→ improve_resume ──→ evaluate_deviation ──→ safety nets ──→ refine ──→ done
     LLM #1              LLM #2           (local, free)         (local)        LLM #3
                              ▲                │
                              │    fail        │ pass
                              └────────────────┘
```

### Evaluator: local, zero LLM cost

The evaluator runs locally — no LLM call. It compares the improved output against the original resume data and returns a pass/fail with specific feedback.

### Where each piece lives

| Component | File | Function |
|-----------|------|----------|
| Deviation evaluator | `app/services/improver.py` | `evaluate_deviation()` |
| Retry loop | `app/services/improver.py` | Inside `improve_resume()` |
| Deviation feedback prompt | `app/prompts/templates.py` | `DEVIATION_FEEDBACK_SUFFIX` |
| Enrichment parallelization | `app/routers/enrichment.py` | `generate_enhancements()` |
| Auto strategy selection | `app/services/improver.py` | `auto_select_strategy()` |

---

## Change 1: Deviation Evaluator

**File: `app/services/improver.py`**

New function `evaluate_deviation()` that checks 5 criteria:

### Check 1: Section count preservation

The LLM must not drop or add work experience, education, or project entries.

```python
def _check_section_counts(
    original: dict[str, Any],
    improved: dict[str, Any],
) -> list[str]:
    issues = []
    for key, label in [
        ("workExperience", "work experience"),
        ("education", "education"),
        ("personalProjects", "project"),
    ]:
        orig_count = len(original.get(key, []))
        imp_count = len(improved.get(key, []))
        if imp_count < orig_count:
            issues.append(
                f"Dropped {orig_count - imp_count} {label} "
                f"entries ({orig_count} → {imp_count}). "
                f"Keep ALL original entries."
            )
        elif imp_count > orig_count:
            issues.append(
                f"Added {imp_count - orig_count} new {label} "
                f"entries ({orig_count} → {imp_count}). "
                f"Do NOT invent new entries."
            )
    return issues
```

**Why this matters:** The most common LLM failure mode is silently dropping the oldest work experience entry when the output gets long. The user doesn't notice until they print the PDF.

### Check 2: Word count ratio

The improved resume should not be more than 1.8x the original word count. Over-elaboration makes resumes look AI-generated.

```python
def _check_word_count(
    original: dict[str, Any],
    improved: dict[str, Any],
    max_ratio: float = 1.8,
) -> list[str]:
    orig_words = _count_description_words(original)
    imp_words = _count_description_words(improved)
    if orig_words > 0 and imp_words > orig_words * max_ratio:
        return [
            f"Description word count increased {imp_words / orig_words:.1f}x "
            f"({orig_words} → {imp_words}). "
            f"Keep descriptions concise — do not over-elaborate."
        ]
    return []
```

**Why 1.8x:** The "full" strategy can legitimately expand bullets. But 2x+ is always over-elaboration. 1.8x gives headroom for the full strategy while catching runaway expansion.

### Check 3: Fabricated skills detection

New skills in the output must come from the JD keywords, not invented by the LLM.

```python
def _check_fabricated_skills(
    original: dict[str, Any],
    improved: dict[str, Any],
    job_keywords: dict[str, Any],
) -> list[str]:
    orig_skills = _extract_skills_set(original)
    imp_skills = _extract_skills_set(improved)
    jd_skills = _extract_jd_skills_set(job_keywords)

    fabricated = imp_skills - orig_skills - jd_skills
    if fabricated:
        # Only flag if more than 1 — single-word variants are common
        if len(fabricated) > 1:
            sample = ", ".join(sorted(fabricated)[:5])
            return [
                f"Added skills not in original resume or job description: "
                f"{sample}. Only use skills from the original resume or JD."
            ]
    return []
```

**Why this catches what the refiner misses:** The refiner checks against the *master* resume (which may have more skills than the original tailored input). This check is tighter — it catches skills that aren't in the JD either.

### Check 4: Company/role preservation

The LLM must not rename companies or job titles.

```python
def _check_entry_identity(
    original: dict[str, Any],
    improved: dict[str, Any],
) -> list[str]:
    issues = []
    for key, title_field, subtitle_field, label in [
        ("workExperience", "title", "company", "work experience"),
        ("education", "degree", "institution", "education"),
    ]:
        orig_entries = original.get(key, [])
        imp_entries = improved.get(key, [])
        for i, (orig, imp) in enumerate(zip(orig_entries, imp_entries)):
            orig_id = (
                orig.get(subtitle_field, "").strip().lower()
            )
            imp_id = (
                imp.get(subtitle_field, "").strip().lower()
            )
            if orig_id and imp_id and orig_id != imp_id:
                issues.append(
                    f"Changed {label}[{i}] {subtitle_field} from "
                    f"'{orig.get(subtitle_field)}' to "
                    f"'{imp.get(subtitle_field)}'. "
                    f"Never change company names, institutions, or degrees."
                )
    return issues
```

### Check 5: personalInfo leakage

The improve prompts tell the LLM to skip personalInfo. If it's in the output, that's a deviation.

```python
def _check_personal_info_leak(improved: dict[str, Any]) -> list[str]:
    pi = improved.get("personalInfo")
    if pi and isinstance(pi, dict) and any(pi.values()):
        return [
            "Output includes personalInfo — the improve prompt "
            "excludes it. Do NOT include personalInfo in output."
        ]
    return []
```

### Combined evaluator

```python
@dataclass
class DeviationResult:
    passed: bool
    issues: list[str]
    severity: str  # "none" | "soft" | "hard"


def evaluate_deviation(
    original: dict[str, Any],
    improved: dict[str, Any],
    job_keywords: dict[str, Any],
) -> DeviationResult:
    """Local quality gate — zero LLM cost.

    Returns pass/fail with specific feedback for retry prompt.
    """
    issues: list[str] = []

    # Hard failures — always retry
    issues.extend(_check_section_counts(original, improved))
    issues.extend(_check_entry_identity(original, improved))

    hard_issues = len(issues)

    # Soft failures — retry only on first attempt
    issues.extend(_check_word_count(original, improved))
    issues.extend(_check_fabricated_skills(original, improved, job_keywords))
    issues.extend(_check_personal_info_leak(improved))

    if not issues:
        return DeviationResult(passed=True, issues=[], severity="none")

    severity = "hard" if hard_issues > 0 else "soft"
    return DeviationResult(passed=False, issues=issues, severity=severity)
```

---

## Change 2: Retry Loop in `improve_resume()`

**File: `app/services/improver.py`** — modify `improve_resume()` function

The current function makes one `complete_json` call and returns. Add a loop around it:

```python
async def improve_resume(
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
    language: str = "en",
    prompt_id: str | None = None,
    original_resume_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    # ... existing setup (lines 170-211) stays the same ...

    max_attempts = 2
    last_result = None

    for attempt in range(max_attempts):
        current_prompt = prompt
        if attempt > 0 and last_result is not None:
            # Append deviation feedback to prompt
            evaluation = evaluate_deviation(
                original_resume_data or {},
                last_result,
                job_keywords,
            )
            feedback = "\n".join(f"- {issue}" for issue in evaluation.issues)
            current_prompt = (
                prompt
                + f"\n\n--- CRITICAL CORRECTIONS (your previous output had these problems) ---\n"
                + feedback
                + "\n\nFix ALL issues listed above. Do not repeat these mistakes."
            )
            logger.info(
                "Deviation retry (attempt %d/%d): %s",
                attempt + 1, max_attempts, feedback,
            )

        result = await complete_json(
            prompt=current_prompt,
            system_prompt="You are an expert resume editor. Output only valid JSON.",
            max_tokens=8192,
        )

        _check_for_truncation(result)
        validated = ResumeData.model_validate(result)
        result_dict = validated.model_dump()

        # Evaluate deviation (skip on last attempt — take what we get)
        if attempt < max_attempts - 1 and original_resume_data:
            evaluation = evaluate_deviation(
                original_resume_data, result_dict, job_keywords,
            )
            if evaluation.passed:
                return result_dict

            # Only retry on hard failures (dropped entries, renamed companies)
            # Soft failures (word count, skills) proceed with warning
            if evaluation.severity == "soft":
                logger.warning(
                    "Soft deviation detected (not retrying): %s",
                    evaluation.issues,
                )
                return result_dict

            # Hard failure — retry
            logger.warning(
                "Hard deviation detected (retrying): %s",
                evaluation.issues,
            )
            last_result = result_dict
            continue

        return result_dict

    # Should not reach here, but safety fallback
    return result_dict
```

### Key design decisions

1. **Max 1 retry (2 total attempts)**: Adding more retries compounds latency. The improve call takes 8-12s. One retry adds 8-12s. Two retries would add 16-24s on top of a flow that already has a 240s timeout.

2. **Hard vs soft severity**: Dropped entries and renamed companies are always retried. Word count and skill issues only generate warnings — the refiner handles fabricated skills anyway.

3. **Feedback goes into the prompt**: The retry appends specific issues to the original prompt. The LLM sees exactly what it did wrong. This is more effective than generic "try again" hints.

4. **Evaluator runs before safety nets**: The safety nets in `resumes.py` (preserve_personal_info, restore_dates, etc.) patch the output. We want the evaluator to run on the raw LLM output, before patching. This means the evaluator lives inside `improve_resume()`, not in the router.

5. **No LLM cost for evaluation**: All 5 checks are local string/set comparisons. The only additional LLM cost is the retry call itself, and only when deviation is detected.

---

## Change 3: Deviation Feedback Prompt Suffix

**File: `app/prompts/templates.py`**

No new prompt template needed. The feedback is constructed dynamically from the evaluator's issues list and appended as a suffix to the existing prompt. This keeps the prompt system simple — no new templates to maintain.

The suffix format:

```
--- CRITICAL CORRECTIONS (your previous output had these problems) ---
- Dropped 1 work experience entry (4 → 3). Keep ALL original entries.
- Changed workExperience[0] company from 'Acme Corp' to 'ACME Corporation'. Never change company names.

Fix ALL issues listed above. Do not repeat these mistakes.
```

---

## Change 4: Parallelization in `generate_enhancements()`

**File: `app/routers/enrichment.py`** — modify `generate_enhancements()` endpoint

Current code (sequential):
```python
for item_id, answers in answers_by_item.items():
    # ... build prompt ...
    result = await complete_json(prompt)  # blocks on each item
    enhancements.append(...)
```

Changed to parallel:
```python
async def _enhance_single_item(item_id, item, answers, questions_by_id):
    """Generate enhanced descriptions for a single item."""
    # ... build prompt (existing code) ...
    result = await complete_json(prompt)
    additional_bullets = result.get("additional_bullets", [])
    if not additional_bullets:
        additional_bullets = result.get("enhanced_description", [])
    if not isinstance(additional_bullets, list):
        additional_bullets = []
    additional_bullets = [str(b) for b in additional_bullets if b]

    return EnhancedDescription(
        item_id=item_id,
        item_type=item.get("item_type", "experience"),
        title=item.get("title", ""),
        original_description=item.get("current_description", []),
        enhanced_description=additional_bullets,
    )


# In generate_enhancements():
tasks = [
    _enhance_single_item(item_id, item_details.get(item_id, {}), answers, questions_by_id)
    for item_id, answers in answers_by_item.items()
    if item_details.get(item_id)
]
results = await asyncio.gather(*tasks, return_exceptions=True)

enhancements = []
for result in results:
    if isinstance(result, Exception):
        logger.warning(f"Failed to enhance item: {result}")
    else:
        enhancements.append(result)
```

**Impact:** If a user has 4 items to enhance, latency drops from ~40s (4 sequential calls) to ~10s (1 parallel batch).

---

## Change 5: Auto Strategy Selection

**File: `app/services/improver.py`**

New function that selects `nudge`/`keywords`/`full` based on keyword overlap, used when `prompt_id="auto"`:

```python
def auto_select_strategy(
    original_resume_data: dict[str, Any],
    job_keywords: dict[str, Any],
) -> str:
    """Select tailoring strategy based on keyword match percentage.

    Uses the same keyword matching logic as the refiner to determine
    how much work the LLM needs to do.
    """
    from app.services.refiner import calculate_keyword_match

    match_pct = calculate_keyword_match(original_resume_data, job_keywords)

    if match_pct >= 70:
        return "nudge"       # already close — light rephrasing
    elif match_pct >= 35:
        return "keywords"    # relevant but missing key terms
    else:
        return "full"        # needs significant restructuring
```

**Integration point** — in `improve_resume()`:
```python
selected_prompt_id = prompt_id or DEFAULT_IMPROVE_PROMPT_ID
if selected_prompt_id == "auto" and original_resume_data:
    selected_prompt_id = auto_select_strategy(original_resume_data, job_keywords)
    logger.info("Auto-selected strategy: %s", selected_prompt_id)
```

This requires adding `"auto"` to the `IMPROVE_PROMPT_OPTIONS` list in `app/prompts/templates.py` so the frontend can offer it.

---

## Summary: All Changes

| # | What | Where | Type | LLM cost |
|---|------|-------|------|----------|
| 1 | `evaluate_deviation()` — 5 local checks | `app/services/improver.py` | New function | 0 |
| 2 | Retry loop in `improve_resume()` | `app/services/improver.py` | Modify existing | +1 call on hard failure only |
| 3 | Deviation feedback suffix | Dynamic (in `improve_resume()`) | No new template | 0 |
| 4 | Parallelize `generate_enhancements()` | `app/routers/enrichment.py` | Modify existing | 0 |
| 5 | `auto_select_strategy()` | `app/services/improver.py` | New function | 0 |

### What we're NOT changing

- `llm.py` — the transport-level retry and JSON quality checks stay as-is
- `refiner.py` — alignment validation, phrase removal, keyword injection stay as-is
- `resumes.py` safety nets — `_preserve_personal_info`, `_restore_original_dates`, etc. stay as-is
- No new dependencies (no LangChain, no workflow engine)
- No new prompt templates — feedback is constructed dynamically

### Latency impact

| Scenario | Current | After change |
|----------|---------|-------------|
| Happy path (no deviation) | ~12s | ~12s (evaluator adds <1ms) |
| Hard deviation (dropped entry) | ~12s (bad output) | ~24s (retry produces correct output) |
| Enrichment (4 items) | ~40s | ~10s |
| Auto strategy | N/A | <1ms (local keyword match) |

---

## Implementation Order

1. **`evaluate_deviation()` + retry loop** — highest impact, catches the worst failures
2. **Enrichment parallelization** — straightforward, immediate latency win
3. **Auto strategy selection** — small addition, requires frontend support for "auto" option
