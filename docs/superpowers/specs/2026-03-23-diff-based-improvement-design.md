# Diff-Based Resume Improvement — Design Spec

> **Status**: Design
> **Date**: 2026-03-23
> **Scope**: Backend improvement pipeline — `improver.py`, `refiner.py`, `resumes.py`, `templates.py`

---

## 1. Problem Statement

The current `improve_resume()` function sends the entire resume + job description + keywords + truthfulness rules + schema example to the LLM in a single prompt and asks for the **entire resume back as JSON**. This is ~4000–7500 input tokens and ~1000–2000 output tokens.

This single-prompt, full-output approach is the root cause of hallucination in the pipeline. The LLM must faithfully reproduce every field it doesn't want to change — company names, dates, bullet points, skills — and every reproduced field is a chance to hallucinate.

### 1.1 Hallucination vectors found in codebase

| # | Vector | Current mitigation | Gap |
|---|--------|-------------------|-----|
| 1 | **Dropped work/education/project entries** | None | **Undetected** — silently lost |
| 2 | **Fabricated skills** | `validate_master_alignment()` in refiner removes them *after* | Reactive, not preventive |
| 3 | **Renamed companies/institutions** | `validate_master_alignment()` checks new companies | Only catches *new* companies, not renames of existing ones |
| 4 | **Invented metrics** ("improved by 40%") | Nothing | **Undetected** — passes all checks |
| 5 | **Dates truncated** ("Jan 2023 - Mar 2024" → "2023 - 2024") | 3 safety nets restore them | Works, but wastes LLM output tokens reproducing dates |
| 6 | **personalInfo in output** | `_preserve_personal_info()` overwrites it | Works, but wastes LLM tokens outputting content it shouldn't |
| 7 | **Over-elaboration** (word count doubles) | Nothing | **Undetected** |
| 8 | **AI phrasing** ("spearheaded", "leveraged") | `remove_ai_phrases()` replaces ~50 blacklisted terms *after* (~47 with mapped replacements) | Reactive — LLM generates them, then they're stripped |
| 9 | **Custom section fabrication** | `_protect_custom_sections()` trims *after* | Reactive |
| 10 | **Context bleed** (JD company names appearing in resume) | Nothing | **Undetected** |

### 1.2 Current safety nets (resumes.py lines 750–763)

Six post-processing functions patch the LLM output:

1. `_preserve_personal_info()` — overwrites personalInfo from original
2. `_restore_original_dates()` — restores month-precision dates
3. `restore_dates_from_markdown()` — fallback date restoration from original PDF markdown
4. `_preserve_original_skills()` — appends any skills the LLM dropped
5. `_protect_custom_sections()` — trims hallucinated items, reverts fabricated descriptions
6. `refine_resume()` — 3-pass refinement (keyword injection, AI phrase removal, alignment validation)

All six exist because the LLM is asked to reproduce content it shouldn't touch. A diff-based approach eliminates that class of problem by construction.

### 1.3 Why not section-by-section parallel calls

We evaluated splitting into parallel per-section LLM calls (summary, experience, projects, skills). This was rejected because:

- **Ollama users**: Ollama serves one request at a time by default (`num_parallel=1`). Parallel calls queue sequentially, making it *slower* than one call (5 prompt ingestions vs 1).
- **Still full-output**: Each section call still regenerates full section text — hallucination risk within each section is unchanged.
- **Half-measure**: Reduces blast radius but doesn't change the fundamental approach.

---

## 2. Solution: Diff-Based Output

Instead of asking the LLM to output the entire resume, ask it to output only what it wants to **change**. The original resume is preserved programmatically, and changes are applied as targeted diffs.

### 2.1 Architecture

```
extract_keywords ──→ generate_diffs ──→ apply_diffs ──→ verify ──→ refiner ──→ aux content
     LLM #1              LLM #2          (local)        (local)     LLM #3      LLM #4-6
```

- **`generate_diffs()`** — new LLM call that returns a list of targeted changes
- **`apply_diffs()`** — local function that applies verified changes to the original resume
- **`verify_diff_result()`** — local quality checks on the result
- **Refiner** — unchanged, receives the full dict produced by `apply_diffs()`
- **Frontend response** — unchanged (`resume_preview`, `diff_summary`, `detailed_changes`)

### 2.2 What each hallucination vector looks like after this change

| # | Vector | How diff-based prevents it |
|---|--------|--------------------------|
| 1 | Dropped entries | **Eliminated** — original structure is the base, entries can't be dropped |
| 2 | Fabricated skills | **Catchable** — skill changes are explicit diffs, verified against JD keywords |
| 3 | Renamed companies | **Eliminated** — company/institution fields are blocked in applier |
| 4 | Invented metrics | **Catchable** — verifier flags new numbers in diffs that weren't in original |
| 5 | Dates truncated | **Eliminated** — date fields are blocked in applier |
| 6 | personalInfo leak | **Eliminated** — personalInfo is blocked in applier |
| 7 | Over-elaboration | **Reduced** — only changed text can grow; unchanged text is preserved exactly |
| 8 | AI phrasing | **Reduced** — smaller output surface area; AI phrase removal still runs after |
| 9 | Custom section fabrication | **Eliminated** — custom sections are blocked in applier |
| 10 | Context bleed | **Catchable** — each diff is inspectable; verifier can check for JD company names |

---

## 3. Diff Schema

### 3.1 `ResumeChange` — a single targeted change

```python
class ResumeChange(BaseModel):
    """A single change the LLM wants to make to the resume."""
    path: str
    action: Literal["replace", "append", "reorder"]
    original: str | None = None
    value: str | list[str]
    reason: str
```

| Field | Purpose |
|-------|---------|
| `path` | Dot + bracket path to the field: `"workExperience[0].description[1]"` |
| `action` | `"replace"` (swap content), `"append"` (add to list), `"reorder"` (reorder list) |
| `original` | The current text at that path — LLM echoes it so the applier can verify |
| `value` | The new content (string or list of strings for reorder) |
| `reason` | Why this change helps match the JD — forces LLM self-justification |

### 3.2 `ImproveDiffResult` — full LLM output

```python
class ImproveDiffResult(BaseModel):
    """What the LLM returns instead of a full resume."""
    changes: list[ResumeChange]
    strategy_notes: str
```

### 3.3 Allowed paths

The applier enforces a whitelist of paths the LLM can target:

| Path pattern | What it modifies | Action types |
|---|---|---|
| `summary` | The summary text | replace |
| `workExperience[i].description[j]` | A specific bullet point | replace |
| `workExperience[i].description` | The bullet list (append new bullet) | append |
| `personalProjects[i].description[j]` | A specific project bullet | replace |
| `personalProjects[i].description` | The bullet list (append new bullet) | append |
| `additional.technicalSkills` | Skills list ordering | reorder |

### 3.4 Blocked paths

These paths are rejected by the applier regardless of what the LLM outputs:

| Path pattern | Why blocked |
|---|---|
| `personalInfo.*` | Always preserved from original |
| `*.years` | Dates are immutable |
| `*.company`, `*.institution` | Identity fields |
| `*.title` (workExperience), `*.degree` | Identity fields |
| `*.name` (personalProjects) | Identity fields |
| `*.role`, `*.github`, `*.website` (personalProjects) | Identity/metadata fields — not content to tailor |
| `*.location` | Identity fields |
| `customSections.*` | Protected separately |
| `education[*].*` | Rarely relevant to tailoring. Note: `education[*].description` could benefit from coursework rephrasing in some cases — this is a deliberate design choice to keep education immutable for now. Can be revisited if users request it. |

---

## 4. Diff Applier

### 4.1 Function signature

```python
def apply_diffs(
    original: dict[str, Any],
    changes: list[ResumeChange],
) -> tuple[dict[str, Any], list[ResumeChange], list[ResumeChange]]:
    """Apply verified diffs to original resume.

    Args:
        original: The original resume data (ResumeData-compatible dict)
        changes: List of changes from the LLM

    Returns:
        (result_dict, applied_changes, rejected_changes)
    """
```

### 4.2 Verification before applying each change

Each change goes through 4 gates before being applied:

1. **Path exists** — `workExperience[0].description[1]` must resolve to a real value in the original dict. If the LLM references an index that doesn't exist, the change is rejected.

2. **Path is allowed** — checked against the whitelist (Section 3.3). If the path matches a blocked pattern (Section 3.4), rejected.

3. **Original text matches** — the `original` field in the diff is compared (case-insensitive, stripped) against the actual value at that path. If they don't match, the LLM hallucinated the original content → rejected.

4. **No identity mutation** — even if the path is technically allowed, the applier checks that company names, titles, institutions, and degrees are unchanged in the result.

### 4.3 Change application

Changes that pass all 4 gates are applied to a `copy.deepcopy()` of the original:

- **`replace`**: Set the value at the resolved path
- **`append`**: Append the value to the list at the resolved path
- **`reorder`**: Validate that the reordered list contains exactly the same items (case-insensitive), then replace

### 4.4 Rejected changes

Changes that fail any gate are **rejected individually** (not all-or-nothing). The applier returns both the applied and rejected lists. Rejected changes generate warnings that flow through to the frontend via `response_warnings`.

---

## 5. Diff Verifier

After `apply_diffs()` produces the result, a local verifier checks for quality issues.

### 5.1 Function signature

```python
def verify_diff_result(
    original: dict[str, Any],
    result: dict[str, Any],
    applied_changes: list[ResumeChange],
    job_keywords: dict[str, Any],
) -> list[str]:
    """Local quality checks on the diff result. Returns list of warnings."""
```

### 5.2 Checks

| # | Check | What it catches | Severity |
|---|-------|-----------------|----------|
| 1 | Section counts preserved | Same number of work entries, education, projects in original vs result | Warning |
| 2 | Identity fields unchanged | Company names, titles, institutions, degrees match original exactly | Warning |
| 3 | Word count ratio | Total description word count didn't exceed 1.8x original | Warning |
| 4 | Skills only from JD or original | Any new skill must exist in `job_keywords` or original resume | Warning |
| 5 | No invented metrics | If a `replace` diff adds a number pattern (`\d+%`, `\d+x`, `\$\d+`) that wasn't in the original bullet at that path | Warning |
| 6 | No empty result | If zero changes were applied, warn (may indicate prompt failure) | Warning |

All checks are local (zero LLM cost). Warnings are informational — they don't block the response. They flow through to `response_warnings` in the API response.

---

## 6. Prompt Template

### 6.1 New prompt: `DIFF_IMPROVE_PROMPT`

```
Given this resume and job description, output a JSON object with targeted changes to better align the resume with the job.

RULES:
1. Only modify content — never change names, companies, dates, institutions, or degrees
2. Do not invent skills, metrics, or achievements not supported by the original resume text
3. Do not add new work entries, education entries, or project entries
4. You may: rephrase existing bullets, add new bullets to existing entries, adjust summary, reorder skills
5. Each change MUST include the original text (copied exactly) so it can be verified
6. For each change, explain WHY it helps match the job description
7. Generate all new text in {output_language}
8. Do not use em dash characters
9. Keep changes minimal and targeted — do not rewrite content that already aligns well

Keywords to emphasize (only if already supported by resume content):
{job_keywords}

Job Description:
{job_description}

Original Resume:
{original_resume}

Output this exact JSON format, nothing else:
{{
  "changes": [
    {{
      "path": "workExperience[0].description[1]",
      "action": "replace",
      "original": "the exact original text at this path",
      "value": "the improved text",
      "reason": "why this change helps"
    }},
    {{
      "path": "summary",
      "action": "replace",
      "original": "the current summary text",
      "value": "the improved summary",
      "reason": "why this change helps"
    }},
    {{
      "path": "additional.technicalSkills",
      "action": "reorder",
      "original": null,
      "value": ["most relevant skill first", "then next", "..."],
      "reason": "reordered to prioritize JD-relevant skills"
    }}
  ],
  "strategy_notes": "brief summary of the tailoring approach"
}}
```

### 6.2 Token budget comparison

| Component | Current prompt | Diff prompt | Savings |
|-----------|---------------|-------------|---------|
| Instructions + rules | ~400 tokens | ~250 tokens | ~150 |
| Truthfulness rules (9 rules) | ~400 tokens | 0 (rules are structural) | ~400 |
| Schema example (IMPROVE_SCHEMA_EXAMPLE) | ~450 tokens | ~150 (diff example) | ~300 |
| Job description | same | same | 0 |
| Keywords | same | same | 0 |
| Original resume | same | same | 0 |
| **Output tokens** | ~1000–2000 (full resume) | ~300–800 (changes only) | **~700–1200** |
| **Total savings** | — | — | **~1550–2050 tokens** |

### 6.3 Prompt selection: strategy-aware

The diff prompt replaces all 3 current prompts (nudge, keywords, full). Strategy is controlled by instruction intensity within the same prompt:

```python
DIFF_STRATEGY_INSTRUCTIONS = {
    "nudge": "Make minimal edits. Only rephrase where there is a clear match. Do not add new bullet points.",
    "keywords": "Weave in relevant keywords where evidence already exists. You may rephrase bullets but do not add new ones.",
    "full": "Make targeted adjustments. You may rephrase bullets and add new ones that elaborate on existing work, but do not invent new responsibilities.",
}
```

This replaces the 3 separate prompt templates (`IMPROVE_RESUME_PROMPT_NUDGE`, `_KEYWORDS`, `_FULL`) and the 3 separate truthfulness rule variants (`CRITICAL_TRUTHFULNESS_RULES`).

---

## 7. Integration with Existing Pipeline

### 7.1 What stays the same

| Component | File | Change? |
|-----------|------|---------|
| `extract_job_keywords()` | `improver.py` | No change |
| `refine_resume()` | `refiner.py` | No change — receives full dict from `apply_diffs()` |
| `analyze_keyword_gaps()` | `refiner.py` | No change |
| `inject_keywords()` | `refiner.py` | No change |
| `remove_ai_phrases()` | `refiner.py` | No change |
| `validate_master_alignment()` | `refiner.py` | No change |
| `calculate_resume_diff()` | `improver.py` | No change — compares original vs final |
| `generate_improvements()` | `improver.py` | No change |
| Auxiliary content generation | `cover_letter.py` | No change |
| Frontend response format | `schemas/models.py` | No change — `resume_preview`, `diff_summary`, `detailed_changes` populated as before |
| Preview → confirm hash validation | `resumes.py` | No change |
| `complete_json()` | `llm.py` | No change — diff output is valid JSON |

### 7.2 What changes

| Component | File | Change |
|-----------|------|--------|
| `improve_resume()` | `improver.py` | Replaced by `generate_resume_diffs()` |
| New: `apply_diffs()` | `improver.py` | New function — applies verified diffs to original |
| New: `verify_diff_result()` | `improver.py` | New function — local quality checks |
| New: `ResumeChange`, `ImproveDiffResult` | `schemas/models.py` | New Pydantic models for diff schema |
| New: `DIFF_IMPROVE_PROMPT` | `prompts/templates.py` | New prompt template |
| New: `DIFF_STRATEGY_INSTRUCTIONS` | `prompts/templates.py` | Per-strategy instruction variants |
| `_improve_preview_flow()` | `routers/resumes.py` | Orchestrates: generate_diffs → apply → verify → refine |

### 7.3 Safety nets after the change

| Safety net | Still needed? | Why |
|-----------|--------------|-----|
| `_preserve_personal_info()` | **Keep as fallback** — should never activate (applier blocks personalInfo) |
| `_restore_original_dates()` | **Keep as fallback** — should never activate (applier blocks dates) |
| `restore_dates_from_markdown()` | **Keep as fallback** — should never activate |
| `_preserve_original_skills()` | **Keep as fallback** — `reorder` action preserves all items |
| `_protect_custom_sections()` | **Keep as fallback** — applier blocks customSections |
| `refine_resume()` | **Keep, unchanged** — alignment validation, keyword injection, AI phrase removal still valuable |

Defense in depth: the applier is the primary guard, safety nets are the secondary guard. If a bug in the applier lets something through, the safety nets catch it.

### 7.4 Updated flow in `_improve_preview_flow()`

```python
# Current (lines 739-746 in resumes.py):
improved_data = await improve_resume(
    original_resume=resume["content"],
    job_description=job["content"],
    job_keywords=job_keywords,
    language=language,
    prompt_id=prompt_id,
    original_resume_data=original_resume_data,
)

# New:
diff_result = await generate_resume_diffs(
    original_resume=resume["content"],
    job_description=job["content"],
    job_keywords=job_keywords,
    language=language,
    prompt_id=prompt_id,
    original_resume_data=original_resume_data,
)

improved_data, applied, rejected = apply_diffs(
    original=original_resume_data,
    changes=diff_result.changes,
)

warnings = verify_diff_result(
    original=original_resume_data,
    result=improved_data,
    applied_changes=applied,
    job_keywords=job_keywords,
)
response_warnings.extend(warnings)

if rejected:
    response_warnings.append(
        f"{len(rejected)} change(s) rejected during verification"
    )
```

Everything downstream (`_preserve_personal_info`, `_restore_original_dates`, `refine_resume`, `calculate_resume_diff`, etc.) remains unchanged — it receives `improved_data` as a full dict, same as today.

---

## 8. Retry Mechanism

### 8.1 Transport-level retries (unchanged)

`complete_json()` in `llm.py` handles:
- Malformed JSON → retry with hint
- Truncated output → retry with hint
- Empty response → retry
- Temperature escalation per retry (0.1 → 0.3 → 0.5 → 0.7)

This stays as-is. The diff JSON output works with all existing retry logic.

### 8.2 Content-level retries (implicit via rejection)

The diff approach makes explicit retry loops unnecessary:

- **Bad diff** (wrong path, mismatched original text) → **rejected by applier** → original content preserved
- **All diffs rejected** → result is the original resume unchanged → warning generated
- **Some diffs rejected** → partial improvement applied → warning lists what was rejected

This is safer than retrying with feedback, which risks compounding hallucination. The worst case is "no changes applied" rather than "wrong changes applied."

### 8.3 `_appears_truncated()` compatibility

The existing truncation detector in `llm.py` checks for empty `workExperience`, `education`, or `skills` arrays. Note: `skills` is a legacy key name — the actual schema uses `additional.technicalSkills`, so this check already doesn't catch all truncation cases in the current flow either.

A diff-based output won't contain these arrays at all — it contains a `changes` list. This means:

- `_appears_truncated()` won't trigger false positives (no empty resume arrays to check)
- Custom truncation detection: if `changes` is an empty list, the LLM may have failed to generate diffs. Log a warning but proceed (returns original resume unchanged).

---

## 9. Latency & Cost Impact

### 9.1 Per-call comparison

| Metric | Current (full output) | Diff-based | Change |
|--------|----------------------|------------|--------|
| Input tokens | ~4000–7500 | ~3500–6500 | -500–1000 |
| Output tokens | ~1000–2000 | ~300–800 | -700–1200 |
| Total tokens | ~5000–9500 | ~3800–7300 | **-25–30%** |
| LLM call count | 1 | 1 | Same |
| Wall-clock time | ~8–12s | ~4–8s | **~30–40% faster** |

### 9.2 Ollama impact

Ollama's generation speed is the bottleneck (token/s on local hardware). Reducing output tokens by 50–70% directly reduces generation time. This is the biggest win for local users.

### 9.3 Pipeline total

| Pipeline step | Current | After | Change |
|---|---|---|---|
| Extract keywords | ~3s | ~3s | Same |
| Improve/diffs | ~8–12s | ~4–8s | **Faster** |
| Apply diffs | — | <1ms | New (local) |
| Verify diffs | — | <1ms | New (local) |
| Safety nets | <1ms | <1ms | Same |
| Refine | ~3–8s | ~3–8s | Same |
| Aux content | ~5–10s | ~5–10s | Same |
| **Total** | **~19–33s** | **~15–29s** | **~15–20% faster** |

---

## 10. File Change Summary

| # | File | Type | Description |
|---|------|------|-------------|
| 1 | `app/schemas/models.py` | Add | `ResumeChange` and `ImproveDiffResult` Pydantic models |
| 2 | `app/prompts/templates.py` | Add | `DIFF_IMPROVE_PROMPT` and `DIFF_STRATEGY_INSTRUCTIONS` |
| 3 | `app/prompts/__init__.py` | Modify | Export `DIFF_IMPROVE_PROMPT` and `DIFF_STRATEGY_INSTRUCTIONS` |
| 4 | `app/services/improver.py` | Add | `generate_resume_diffs()`, `apply_diffs()`, `verify_diff_result()` |
| 5 | `app/services/improver.py` | Keep | `improve_resume()` kept for backward compatibility / fallback |
| 6 | `app/routers/resumes.py` | Modify | `_improve_preview_flow()` calls new diff functions |
| 7 | `app/llm.py` | No change | `complete_json()` works as-is with diff JSON |
| 8 | `app/services/refiner.py` | No change | Receives full dict from `apply_diffs()` |
| 9 | `app/services/cover_letter.py` | No change | Receives full dict |
| 10 | `app/routers/enrichment.py` | No change | Separate feature |
| 11 | Frontend | No change | `resume_preview`, `diff_summary`, `detailed_changes` populated as before |

### 10.1 What we're NOT changing

- `llm.py` — transport-level retry and JSON extraction stay as-is
- `refiner.py` — all 3 passes (keyword injection, AI phrase removal, alignment validation) stay as-is
- Safety nets in `resumes.py` — kept as defense-in-depth fallback
- Frontend response format — `ImproveResumeResponse` unchanged
- Preview → confirm hash validation — unchanged
- No new dependencies (no LangChain, no workflow engine)
- `improve_resume()` preserved as fallback (not deleted)

---

## 11. Implementation Order

1. **Add schemas** — `ResumeChange`, `ImproveDiffResult` in `schemas/models.py`
2. **Add prompt** — `DIFF_IMPROVE_PROMPT`, `DIFF_STRATEGY_INSTRUCTIONS` in `prompts/templates.py`
3. **Add `generate_resume_diffs()`** — new LLM call function in `improver.py`
4. **Add `apply_diffs()`** — diff applier with path resolution and verification gates in `improver.py`
5. **Add `verify_diff_result()`** — local quality checks in `improver.py`
6. **Wire into `_improve_preview_flow()`** — update orchestration in `resumes.py`
7. **Test with existing frontend** — no frontend changes needed
8. **Keep `improve_resume()` as fallback** — can be selected via config flag during rollout

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM outputs wrong path indices | Medium | Low | Applier verifies `original` text matches — wrong index = mismatch = rejected |
| LLM outputs empty changes list | Low | Low | Warning generated, original resume returned unchanged |
| LLM ignores diff format, outputs full resume | Low | Medium | `complete_json()` parses whatever JSON it returns; if no `changes` key, treat as 0 changes + warning |
| Smaller models struggle with diff format | Medium | Medium | Keep `improve_resume()` as fallback for models that can't follow diff instructions |
| `apply_diffs()` has a bug that corrupts data | Low | High | Safety nets still run after (defense in depth); `improve_resume()` fallback available |
| Diff verification rejects too aggressively | Medium | Low | Individual rejection (not all-or-nothing); user sees partial improvement rather than nothing |

---

## 13. Success Criteria

- [ ] Zero structural deviations (dropped entries, renamed companies) in diff-based output
- [ ] Invented metrics flagged by verifier in >90% of cases
- [ ] Token usage reduced by 25%+ vs current approach
- [ ] All existing frontend flows work without changes
- [ ] Safety nets rarely activate (tracked via logging)
- [ ] `npm run lint` passes
- [ ] Python functions have type hints
