# Service Layer Issues

> **Component:** `apps/backend/app/services/`, `apps/backend/app/routers/resumes.py`
> **Issues Found:** 14
> **Critical:** 2 | **High:** 4 | **Medium:** 8

---

## Table of Contents

1. [SVC-001: Shallow Copy in Personal Info Preservation](#svc-001-shallow-copy-in-personal-info-preservation)
2. [SVC-002: Fabricated Companies Not Auto-Removed](#svc-002-fabricated-companies-not-auto-removed)
3. [SVC-003: Incomplete Error Handling in Multi-Pass Refinement](#svc-003-incomplete-error-handling-in-multi-pass-refinement)
4. [SVC-004: Race Condition in Preview Hash Management](#svc-004-race-condition-in-preview-hash-management)
5. [SVC-005: Unsafe Hash Validation Backward Compatibility](#svc-005-unsafe-hash-validation-backward-compatibility)
6. [SVC-006: Missing Null Checks in Refinement Stats](#svc-006-missing-null-checks-in-refinement-stats)
7. [SVC-007: Overly Broad Exception Catching](#svc-007-overly-broad-exception-catching)
8. [SVC-008: Insufficient Async Error Handling](#svc-008-insufficient-async-error-handling)
9. [SVC-009: Empty Keywords Returns 100% Match](#svc-009-empty-keywords-returns-100-match)
10. [SVC-010: Case-Insensitive Substring Matching](#svc-010-case-insensitive-substring-matching)
11. [SVC-011: Inefficient Text Extraction](#svc-011-inefficient-text-extraction)
12. [SVC-012: Unvalidated Resume Data After LLM Parsing](#svc-012-unvalidated-resume-data-after-llm-parsing)
13. [SVC-013: Deep Copy Uses JSON Serialization](#svc-013-deep-copy-uses-json-serialization)
14. [SVC-014: Alignment Validation Not Blocking](#svc-014-alignment-validation-not-blocking)

---

## SVC-001: Shallow Copy in Personal Info Preservation

**Severity:** CRITICAL
**Location:** `apps/backend/app/routers/resumes.py:151-161`

### Description

`_preserve_personal_info()` uses shallow copy which can cause data mutation across references.

### Current Code

```python
def _preserve_personal_info(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    if not original_data:
        return improved_data
    original_info = original_data.get("personalInfo")
    if isinstance(original_info, dict):
        improved_data = dict(improved_data)  # SHALLOW COPY - only copies top level!
        improved_data["personalInfo"] = original_info
    return improved_data
```

### Impact

`dict(improved_data)` creates a shallow copy:
- Top-level keys are copied
- Nested dictionaries (like `additional`, `workExperience`) remain references to the original
- If `improved_data["personalInfo"]` (which is `original_info`) is later mutated, it affects the original resume data in the database

**Risk Level:** HIGH - Data integrity violation

### Proposed Fix

```python
import copy

def _preserve_personal_info(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Preserve personal info from original resume.

    Uses deep copy to prevent mutation of original data.
    """
    if not original_data:
        return improved_data

    original_info = original_data.get("personalInfo")
    if isinstance(original_info, dict):
        # Deep copy to prevent any mutation of original
        result = copy.deepcopy(improved_data)
        result["personalInfo"] = copy.deepcopy(original_info)
        return result

    return improved_data
```

---

## SVC-002: Fabricated Companies Not Auto-Removed

**Severity:** CRITICAL
**Location:** `apps/backend/app/services/refiner.py:370-374`

### Description

Critical alignment violation (fabricated company) is detected but NOT REMOVED from the resume.

### Current Code

```python
elif violation.violation_type == "fabricated_company":
    # Log but don't auto-fix - this is a serious error
    logger.error("Critical: Fabricated company detected: %s", violation.value)
    # Returns unchanged - company stays in resume!
```

### Impact

- Fabricated company is detected
- Only logged as error
- Resume returned unchanged with fabrication still present
- User may unknowingly submit resume with fake company
- **Integrity violation persists in output**

### Proposed Fix

```python
elif violation.violation_type == "fabricated_company":
    logger.error("Critical: Fabricated company detected: %s", violation.value)

    # Remove the fabricated work experience entry
    if "workExperience" in fixed:
        fixed["workExperience"] = [
            exp for exp in fixed["workExperience"]
            if exp.get("company", "").lower() != violation.value.lower()
        ]
        logger.info(
            "Removed fabricated company '%s' from resume",
            violation.value
        )

# Alternative: Raise exception to block the resume
elif violation.violation_type == "fabricated_company":
    raise ValueError(
        f"Resume contains fabricated company: {violation.value}. "
        "This content was not in your original resume."
    )
```

---

## SVC-003: Incomplete Error Handling in Multi-Pass Refinement

**Severity:** HIGH
**Location:** `apps/backend/app/services/refiner.py:60-96`

### Description

When keyword injection fails, the code logs a warning and continues with unrefined data, but stats may misreport.

### Current Code

```python
# Pass 1: Keyword injection (if enabled)
if config.enable_keyword_injection:
    keyword_analysis = analyze_keyword_gaps(...)
    if keyword_analysis.injectable_keywords:
        try:
            current = await inject_keywords(...)
            passes += 1
        except Exception as e:
            logger.warning("Keyword injection failed: %s", e)
            # CONTINUES WITHOUT UPDATING - silent failure!
```

### Impact

- Pass counter might not reflect actual passes completed
- User sees refinement_stats but keyword_injection may have failed silently
- No indication that a critical pass was skipped

### Proposed Fix

```python
class PassResult(BaseModel):
    name: str
    attempted: bool = False
    successful: bool = False
    error: str | None = None

async def refine_resume(...) -> RefinementResult:
    pass_results: list[PassResult] = []

    # Pass 1: Keyword injection
    if config.enable_keyword_injection:
        pass_result = PassResult(name="keyword_injection", attempted=True)
        keyword_analysis = analyze_keyword_gaps(...)

        if keyword_analysis.injectable_keywords:
            try:
                current = await inject_keywords(...)
                pass_result.successful = True
                passes += 1
            except Exception as e:
                logger.warning("Keyword injection failed: %s", e)
                pass_result.error = str(e)
        else:
            pass_result.successful = True  # Nothing to inject

        pass_results.append(pass_result)

    # Include pass results in response
    return RefinementResult(
        refined_data=current,
        pass_results=pass_results,
        # ... other fields
    )
```

---

## SVC-004: Race Condition in Preview Hash Management

**Severity:** HIGH
**Location:** `apps/backend/app/routers/resumes.py:515-532`

### Description

Preview hash updates use read-modify-write pattern without locking, causing race conditions.

### Current Code

```python
preview_hashes = job.get("preview_hashes")
if not isinstance(preview_hashes, dict):
    preview_hashes = {}
preview_hashes[prompt_id] = preview_hash
# NOTE: preview_hashes updates are last-write-wins; concurrent previews can race.
try:
    updated_job = db.update_job(...)
    if not updated_job:
        logger.warning("Failed to persist preview hash for job %s.", request.job_id)
except Exception as e:
    logger.warning("Failed to persist preview hash for job %s: %s", request.job_id, e)
```

### Impact

1. Race condition acknowledged in comment but not mitigated
2. Two concurrent preview requests for the same job_id will:
   - Both read `preview_hashes`
   - Both add their prompt_id
   - Last write wins, first request's hash is lost
3. When confirm is called, hash validation might fail for the "lost" preview

### Proposed Fix

```python
import threading

_preview_hash_locks: dict[str, threading.Lock] = {}
_lock_manager = threading.Lock()

def _get_job_lock(job_id: str) -> threading.Lock:
    """Get or create a lock for a specific job."""
    with _lock_manager:
        if job_id not in _preview_hash_locks:
            _preview_hash_locks[job_id] = threading.Lock()
        return _preview_hash_locks[job_id]

# In the handler:
job_lock = _get_job_lock(request.job_id)
with job_lock:
    # Re-fetch job to get latest preview_hashes
    job = db.get_job(request.job_id)
    preview_hashes = job.get("preview_hashes", {})
    preview_hashes[prompt_id] = preview_hash

    db.update_job(
        request.job_id,
        {"preview_hashes": preview_hashes}
    )
```

---

## SVC-005: Unsafe Hash Validation Backward Compatibility

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:602-629`

### Description

Backward compatibility layers for hash validation create attack surface and schema inconsistency.

### Current Code

```python
preview_hashes = job.get("preview_hashes")
allowed_hashes: set[str] = set()
if isinstance(preview_hashes, dict):
    allowed_hashes.update(preview_hashes.values())
elif isinstance(preview_hashes, list):  # Legacy support
    allowed_hashes.update([value for value in preview_hashes if isinstance(value, str)])
else:
    preview_hash = job.get("preview_hash")  # Fallback to old single hash
    if isinstance(preview_hash, str):
        allowed_hashes.add(preview_hash)
```

### Impact

- Multiple hash versions stored (dict values, list values, single value)
- If old single `preview_hash` is set, ANY preview hash validation passes
- Schema inconsistency: dict vs list vs string handling adds complexity
- If both old and new formats exist, precedence is unclear

### Proposed Fix

```python
def _get_allowed_hashes(job: dict) -> set[str]:
    """Get allowed preview hashes with migration."""
    preview_hashes = job.get("preview_hashes")

    # Only support the current format (dict)
    if isinstance(preview_hashes, dict):
        return set(preview_hashes.values())

    # Legacy migration: convert old formats
    allowed: set[str] = set()

    if isinstance(preview_hashes, list):
        # Migrate list to dict format
        logger.info("Migrating legacy list preview_hashes for job %s", job["job_id"])
        migrated = {f"legacy_{i}": h for i, h in enumerate(preview_hashes) if isinstance(h, str)}
        db.update_job(job["job_id"], {"preview_hashes": migrated})
        allowed.update(migrated.values())

    # Check for very old single hash
    preview_hash = job.get("preview_hash")
    if isinstance(preview_hash, str):
        logger.info("Migrating legacy single preview_hash for job %s", job["job_id"])
        allowed.add(preview_hash)

    return allowed
```

---

## SVC-006: Missing Null Checks in Refinement Stats

**Severity:** LOW
**Location:** `apps/backend/app/routers/resumes.py:483-504`

### Description

Stats calculation accesses nested properties that could theoretically be None.

### Current Code

```python
refinement_stats = RefinementStats(
    passes_completed=refinement_result.passes_completed,
    keywords_injected=(
        len(refinement_result.keyword_analysis.injectable_keywords)
        if refinement_result.keyword_analysis
        else 0
    ),
    ai_phrases_removed=refinement_result.ai_phrases_removed,
    alignment_violations_fixed=(
        len([v for v in refinement_result.alignment_report.violations
            if v.severity == "critical"])
        if refinement_result.alignment_report
        else 0
    ),
```

### Impact

- Checks `if refinement_result.keyword_analysis` but then accesses `.injectable_keywords`
- If `injectable_keywords` is None (schema change), AttributeError occurs
- Currently protected by Pydantic defaults, but fragile

### Proposed Fix

```python
def _safe_len(obj: list | None) -> int:
    """Safely get length of potentially None list."""
    return len(obj) if obj else 0

refinement_stats = RefinementStats(
    passes_completed=refinement_result.passes_completed,
    keywords_injected=_safe_len(
        refinement_result.keyword_analysis.injectable_keywords
        if refinement_result.keyword_analysis else None
    ),
    ai_phrases_removed=refinement_result.ai_phrases_removed,
    alignment_violations_fixed=_safe_len(
        [v for v in (refinement_result.alignment_report.violations or [])
         if v.severity == "critical"]
        if refinement_result.alignment_report else None
    ),
)
```

---

## SVC-007: Overly Broad Exception Catching

**Severity:** LOW
**Location:** `apps/backend/app/routers/resumes.py:855-860`

### Description

Top-level exception handler catches ALL exceptions including system exits.

### Current Code

```python
except Exception as e:
    logger.error(f"Resume improvement failed: {e}")
    raise HTTPException(
        status_code=500,
        detail="Failed to improve resume. Please try again.",
    )
```

### Impact

- Catches `KeyboardInterrupt`, `SystemExit`, etc. which should propagate
- Masks programming errors (AttributeError, TypeError) as user-facing 500 errors
- Makes debugging difficult

### Proposed Fix

```python
except HTTPException:
    # Re-raise HTTP exceptions as-is
    raise
except (ValueError, ValidationError) as e:
    # Known validation errors - client error
    logger.warning("Validation error in resume improvement: %s", e)
    raise HTTPException(status_code=422, detail=str(e))
except (asyncio.TimeoutError, TimeoutError) as e:
    # Timeout errors - service unavailable
    logger.error("Timeout in resume improvement: %s", e)
    raise HTTPException(
        status_code=503,
        detail="Request timed out. Please try again."
    )
except Exception as e:
    # Unexpected errors - log full traceback
    logger.exception("Unexpected error in resume improvement")
    raise HTTPException(
        status_code=500,
        detail="An unexpected error occurred. Please try again.",
    )
```

---

## SVC-008: Insufficient Async Error Handling

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:206-243`

### Description

Exception objects are logged with `%s` which may not show full traceback.

### Current Code

```python
if not isinstance(result, Exception):
    cover_letter = result
else:
    logger.warning("Cover letter generation failed: %s", result)  # result is Exception
```

### Impact

- Exception logged as `%s` which only shows `str(exception)`
- Full traceback is lost
- If BOTH cover letter and outreach fail, both return `None` with only warnings
- No user indication that auxiliary documents failed

### Proposed Fix

```python
if isinstance(result, Exception):
    logger.warning(
        "Cover letter generation failed: %s",
        result,
        exc_info=result,  # Include full traceback
    )
    # Or use logger.exception() in the except block where exception is caught
```

---

## SVC-009: Empty Keywords Returns 100% Match

**Severity:** MEDIUM
**Location:** `apps/backend/app/services/refiner.py:399-403`

### Description

If job description extraction fails and returns empty keywords, match is reported as 100%.

### Current Code

```python
def calculate_keyword_match(resume: dict[str, Any], jd_keywords: dict[str, Any]) -> float:
    all_keywords: set[str] = set()
    all_keywords.update(jd_keywords.get("required_skills", []))
    # ...

    if not all_keywords:
        return 100.0  # No keywords = perfect match? This is wrong!

    matched = sum(1 for kw in all_keywords if kw.lower() in resume_text)
    return (matched / len(all_keywords)) * 100
```

### Impact

- Empty keywords from failed extraction → 100% match reported
- User sees false positive "perfect match"
- Misleading metrics

### Proposed Fix

```python
def calculate_keyword_match(
    resume: dict[str, Any],
    jd_keywords: dict[str, Any]
) -> tuple[float, str]:
    """Calculate keyword match percentage.

    Returns:
        (match_percentage, status) where status is 'calculated', 'no_keywords', or 'error'
    """
    all_keywords: set[str] = set()
    all_keywords.update(jd_keywords.get("required_skills", []))
    all_keywords.update(jd_keywords.get("preferred_skills", []))
    # ... etc

    if not all_keywords:
        logger.warning("No keywords found in job description")
        return 0.0, "no_keywords"  # Return 0, not 100

    resume_text = _extract_all_text(resume).lower()
    matched = sum(1 for kw in all_keywords if kw.lower() in resume_text)

    return (matched / len(all_keywords)) * 100, "calculated"
```

---

## SVC-010: Case-Insensitive Substring Matching

**Severity:** HIGH
**Location:** `apps/backend/app/services/refiner.py:141-148`

### Description

Keyword matching uses substring matching instead of word boundary matching.

### Current Code

```python
for keyword in all_jd_keywords:
    kw_lower = keyword.lower()
    if kw_lower not in tailored_text:  # substring match!
        missing.append(keyword)
```

### Impact

- Searching for "python" matches "pythonic"
- Searching for "c" matches any word with 'c' in it
- Searching for "go" matches "going", "google", etc.
- Over-reporting of keyword matches
- Under-reporting of missing keywords

### Proposed Fix

```python
import re

def _keyword_in_text(keyword: str, text: str) -> bool:
    """Check if keyword exists as a whole word in text."""
    # Escape special regex characters in keyword
    escaped = re.escape(keyword.lower())
    # Use word boundaries
    pattern = rf'\b{escaped}\b'
    return bool(re.search(pattern, text.lower()))

for keyword in all_jd_keywords:
    if not _keyword_in_text(keyword, tailored_text):
        missing.append(keyword)
```

---

## SVC-011: Inefficient Text Extraction

**Severity:** LOW
**Location:** `apps/backend/app/services/refiner.py:406-457`

### Description

Text extraction function is called multiple times without caching.

### Current Code

```python
def _extract_all_text(data: dict[str, Any]) -> str:
    """Extract all text content from resume data for keyword matching."""
    parts: list[str] = []
    # ... extracts text from 5+ sections
    return " ".join(p for p in parts if p)
```

### Impact

- Called in `analyze_keyword_gaps()` twice (for tailored and master)
- Called in `calculate_keyword_match()` multiple times
- For a typical resume with 100+ work experience descriptions, this concatenates text repeatedly
- No caching

### Proposed Fix

```python
from functools import lru_cache
import hashlib

def _hash_resume(data: dict[str, Any]) -> str:
    """Create hash of resume for caching."""
    return hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()

@lru_cache(maxsize=100)
def _extract_all_text_cached(resume_hash: str, resume_json: str) -> str:
    """Cached text extraction."""
    data = json.loads(resume_json)
    return _extract_all_text_impl(data)

def _extract_all_text(data: dict[str, Any]) -> str:
    """Extract all text with caching."""
    resume_json = json.dumps(data, sort_keys=True)
    resume_hash = hashlib.md5(resume_json.encode()).hexdigest()
    return _extract_all_text_cached(resume_hash, resume_json)
```

---

## SVC-012: Unvalidated Resume Data After LLM Parsing

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:305-320`

### Description

Status can be briefly inconsistent during the update process.

### Current Code

```python
try:
    processed_data = await parse_resume_to_json(markdown_content)
    db.update_resume(
        resume["resume_id"],
        {
            "processed_data": processed_data,
            "processing_status": "ready",
        },
    )
    resume["processed_data"] = processed_data
    resume["processing_status"] = "ready"
except Exception as e:
    logger.warning(f"Resume parsing to JSON failed for {file.filename}: {e}")
    db.update_resume(resume["resume_id"], {"processing_status": "failed"})
    resume["processing_status"] = "failed"
```

### Impact

- `parse_resume_to_json()` calls `ResumeData.model_validate(result)`
- If validation fails, Exception is caught
- Window exists where resume is in unknown state between updates
- Status inconsistency during error handling

### Proposed Fix

```python
try:
    processed_data = await parse_resume_to_json(markdown_content)

    # Validate before updating
    ResumeData.model_validate(processed_data)

    # Single atomic-like update
    db.update_resume(
        resume["resume_id"],
        {
            "processed_data": processed_data,
            "processing_status": "ready",
            "processed_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    resume["processed_data"] = processed_data
    resume["processing_status"] = "ready"

except ValidationError as e:
    logger.error(f"Resume validation failed for {file.filename}: {e}")
    db.update_resume(
        resume["resume_id"],
        {
            "processing_status": "failed",
            "processing_error": str(e),
        }
    )
    resume["processing_status"] = "failed"

except Exception as e:
    logger.exception(f"Resume parsing failed for {file.filename}")
    db.update_resume(resume["resume_id"], {"processing_status": "failed"})
    resume["processing_status"] = "failed"
```

---

## SVC-013: Deep Copy Uses JSON Serialization

**Severity:** LOW
**Location:** `apps/backend/app/services/refiner.py:460-473`

### Description

Deep copy implementation uses JSON round-trip which can fail for non-JSON types.

### Current Code

```python
def _deep_copy(data: dict[str, Any]) -> dict[str, Any]:
    """Create a deep copy of a dictionary.
    Uses JSON serialization for simplicity and to handle nested structures.
    """
    import json
    return json.loads(json.dumps(data))
```

### Impact

- Will fail for datetime objects, sets, custom classes
- Special float values (NaN, Infinity) become null
- Generally safe for resume data, but fragile

### Proposed Fix

```python
import copy

def _deep_copy(data: dict[str, Any]) -> dict[str, Any]:
    """Create a deep copy of a dictionary.

    Uses copy.deepcopy for reliability with all Python types.
    """
    return copy.deepcopy(data)
```

---

## SVC-014: Alignment Validation Not Blocking

**Severity:** HIGH
**Location:** `apps/backend/app/services/refiner.py:202-294`

### Description

Alignment validation detects violations but doesn't block the resume from being returned.

### Current Code

```python
if not alignment.is_aligned:
    logger.warning("Alignment violations found: %d", len(alignment.violations))
    current = fix_alignment_violations(current, alignment.violations)
```

### Impact

- Critical violations (fabricated skills, companies) are only logged
- Resume continues through the pipeline
- User may receive resume with integrity violations
- No hard stop for critical issues

### Proposed Fix

```python
if not alignment.is_aligned:
    critical_violations = [
        v for v in alignment.violations
        if v.severity == "critical"
    ]

    if critical_violations:
        logger.error(
            "Critical alignment violations found: %s",
            [v.model_dump() for v in critical_violations]
        )
        raise ValueError(
            f"Resume contains fabricated content that cannot be auto-fixed: "
            f"{[v.value for v in critical_violations]}"
        )

    # Only auto-fix non-critical violations
    logger.warning(
        "Alignment violations found: %d, auto-fixing",
        len(alignment.violations)
    )
    current = fix_alignment_violations(current, alignment.violations)
```
