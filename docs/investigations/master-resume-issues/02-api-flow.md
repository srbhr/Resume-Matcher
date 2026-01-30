# API Flow Issues

> **Component:** `apps/backend/app/routers/resumes.py`
> **Issues Found:** 13
> **Critical:** 2 | **High:** 4 | **Medium:** 7

---

## Table of Contents

1. [API-001: Silent Success with Failed JSON Parsing](#api-001-silent-success-with-failed-json-parsing)
2. [API-002: Master Resume Assignment Race Condition](#api-002-master-resume-assignment-race-condition)
3. [API-003: No Master Resume Existence Validation](#api-003-no-master-resume-existence-validation)
4. [API-004: DB Update Failures Ignored](#api-004-db-update-failures-ignored)
5. [API-005: Processing Status Field Confusion](#api-005-processing-status-field-confusion)
6. [API-006: Personal Info Preservation Can Fail](#api-006-personal-info-preservation-can-fail)
7. [API-007: Diff Calculation Silent Failure](#api-007-diff-calculation-silent-failure)
8. [API-008: Refinement Silent Fallback](#api-008-refinement-silent-fallback)
9. [API-009: Auxiliary Message Generation Partial Failures](#api-009-auxiliary-message-generation-partial-failures)
10. [API-010: Hash Validation Race Condition](#api-010-hash-validation-race-condition)
11. [API-011: Update Return Value Not Checked](#api-011-update-return-value-not-checked)
12. [API-012: Improvement Record Not Found Generic Error](#api-012-improvement-record-not-found-generic-error)
13. [API-013: Processed Data Weak Validation](#api-013-processed-data-weak-validation)

---

## API-001: Silent Success with Failed JSON Parsing

**Severity:** CRITICAL
**Location:** `apps/backend/app/routers/resumes.py:305-320`

### Description

The upload endpoint returns HTTP 200 and claims success even when resume JSON parsing fails. The response always says "successfully processed" regardless of actual `processing_status`.

### Current Code

```python
try:
    processed_data = await parse_resume_to_json(markdown_content)
    db.update_resume(resume["resume_id"], {
        "processed_data": processed_data,
        "processing_status": "ready",
    })
except Exception as e:
    logger.warning(f"Resume parsing to JSON failed for {file.filename}: {e}")
    db.update_resume(resume["resume_id"], {"processing_status": "failed"})
    resume["processing_status"] = "failed"

return ResumeUploadResponse(
    message=f"File {file.filename} successfully processed as MD and stored in the DB",
    request_id=str(uuid4()),
    resume_id=resume["resume_id"],
)
```

### Impact

- Response always says "successfully processed" regardless of `processing_status`
- Client gets 200 OK even when the resume is in "failed" state
- Frontend may think parsing succeeded when it actually failed
- Master resume set to `is_master=True` even if JSON parsing fails
- First upload always becomes master, even if it fails to parse
- User won't know the resume couldn't be analyzed by the LLM

### Proposed Fix

```python
try:
    processed_data = await parse_resume_to_json(markdown_content)
    db.update_resume(resume["resume_id"], {
        "processed_data": processed_data,
        "processing_status": "ready",
    })
    resume["processing_status"] = "ready"
except Exception as e:
    logger.warning(f"Resume parsing to JSON failed for {file.filename}: {e}")
    db.update_resume(resume["resume_id"], {"processing_status": "failed"})
    resume["processing_status"] = "failed"

# Return accurate status to client
return ResumeUploadResponse(
    message=(
        f"File {file.filename} uploaded successfully"
        if resume["processing_status"] == "ready"
        else f"File {file.filename} uploaded but parsing failed"
    ),
    request_id=str(uuid4()),
    resume_id=resume["resume_id"],
    processing_status=resume["processing_status"],  # Add to response model
    is_master=resume.get("is_master", False),
)
```

### Response Model Update

```python
class ResumeUploadResponse(BaseModel):
    message: str
    request_id: str
    resume_id: str
    processing_status: Literal["pending", "ready", "failed"] = "pending"
    is_master: bool = False
```

---

## API-002: Master Resume Assignment Race Condition

**Severity:** CRITICAL
**Location:** `apps/backend/app/routers/resumes.py:291-292`

### Description

No atomic check-and-set for master resume assignment. Two concurrent upload requests can both see no master resume and both set `is_master=True`.

### Current Code

```python
is_master = db.get_master_resume() is None
# ... upload happens ...
resume = db.create_resume(..., is_master=is_master, ...)
```

### Impact

- Two concurrent upload requests can both see no master resume
- Both will set `is_master=True`
- Database now has multiple resumes marked as master
- `db.get_master_resume()` returns unpredictable result
- `_get_original_resume_data()` for refinement uses wrong master
- Multi-pass refinement may use wrong master resume

### Proposed Fix

```python
import threading

_master_resume_lock = threading.Lock()

async def upload_resume(...):
    # ... file processing ...

    with _master_resume_lock:
        is_master = db.get_master_resume() is None
        resume = db.create_resume(
            content=markdown_content,
            content_type=content_type,
            filename=file.filename,
            is_master=is_master,
            processing_status="pending",
        )

    # ... rest of processing ...
```

### Alternative: Database-Level Lock

```python
def create_resume_atomic_master(self, ...) -> dict[str, Any]:
    """Create resume with atomic master assignment."""
    Resume = Query()

    # Check and set in single operation
    current_master = self.resumes.search(Resume.is_master == True)
    is_master = len(current_master) == 0

    doc = {
        "resume_id": str(uuid4()),
        "is_master": is_master,
        # ... other fields
    }

    self.resumes.insert(doc)
    return doc
```

---

## API-003: No Master Resume Existence Validation

**Severity:** MEDIUM
**Location:** `apps/backend/app/database.py:118-127`

### Description

`set_master_resume()` doesn't check that the resume ID being set actually exists before updating.

### Current Code

```python
def set_master_resume(self, resume_id: str) -> bool:
    Resume = Query()
    # Unset current master
    self.resumes.update({"is_master": False}, Resume.is_master == True)
    # Set new master
    updated = self.resumes.update(
        {"is_master": True}, Resume.resume_id == resume_id
    )
    return len(updated) > 0
```

### Impact

- If resume_id doesn't exist, both updates succeed
- No master resume exists but function returns `True` (incorrectly)
- After this call, `get_master_resume()` returns None
- System breaks gracefully but inconsistently

### Proposed Fix

```python
def set_master_resume(self, resume_id: str) -> bool:
    """Set a resume as master. Returns False if resume doesn't exist."""
    Resume = Query()

    # First verify the target resume exists
    target = self.resumes.search(Resume.resume_id == resume_id)
    if not target:
        logger.warning("Cannot set master: resume %s not found", resume_id)
        return False

    # Unset current master
    self.resumes.update({"is_master": False}, Resume.is_master == True)

    # Set new master
    updated = self.resumes.update(
        {"is_master": True}, Resume.resume_id == resume_id
    )

    return len(updated) > 0
```

---

## API-004: DB Update Failures Ignored

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:434-448`

### Description

Job keyword extraction caches results, but failures are logged only as warnings and processing continues.

### Current Code

```python
try:
    updated_job = db.update_job(
        request.job_id,
        {"job_keywords": job_keywords, "job_keywords_hash": content_hash},
    )
    if not updated_job:
        logger.warning(
            "Failed to persist job keywords for job %s.",
            request.job_id,
        )
except Exception as e:
    logger.warning(
        "Failed to persist job keywords for job %s: %s",
        request.job_id,
        e,
    )
```

### Impact

- Keywords extracted but not cached = wasted API calls on retry
- No indication to client that caching failed
- Same issue at lines 520-532 for preview hashes

### Proposed Fix

```python
# Add warning to response when caching fails
response_warnings: list[str] = []

try:
    updated_job = db.update_job(...)
    if not updated_job:
        response_warnings.append("Keyword cache update failed - may need to re-extract")
except Exception as e:
    logger.warning("Failed to persist job keywords: %s", e)
    response_warnings.append("Keyword cache update failed")

# Include warnings in response
return ImproveResumeResponse(
    ...,
    warnings=response_warnings,
)
```

---

## API-005: Processing Status Field Confusion

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:343, 393-395`

### Description

`processing_status` defaults silently to "pending" for old records that don't have this field.

### Current Code

```python
processing_status = resume.get("processing_status", "pending")
```

### Impact

- Old resumes without this field appear as "pending" but are actually "ready"
- Migration function never runs
- Frontend shows wrong status

### Proposed Fix

```python
def _get_processing_status(resume: dict) -> str:
    """Get processing status with intelligent default for legacy records."""
    status = resume.get("processing_status")

    if status:
        return status

    # Legacy record - infer status from data presence
    if resume.get("processed_data"):
        return "ready"
    elif resume.get("content"):
        return "pending"
    else:
        return "failed"

# Add migration on startup
async def migrate_processing_status():
    """Add processing_status to legacy records."""
    all_resumes = db.get_all_resumes()
    for resume in all_resumes:
        if "processing_status" not in resume:
            status = "ready" if resume.get("processed_data") else "pending"
            db.update_resume(resume["resume_id"], {"processing_status": status})
```

---

## API-006: Personal Info Preservation Can Fail

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:151-161`

### Description

If original data is missing, personal info is not preserved and AI-generated info may be used.

### Current Code

```python
def _preserve_personal_info(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    if not original_data:
        return improved_data  # Returns with AI-generated personalInfo
    original_info = original_data.get("personalInfo")
    if isinstance(original_info, dict):
        improved_data = dict(improved_data)
        improved_data["personalInfo"] = original_info
    return improved_data
```

### Impact

- If `processed_data` is None, original info is lost
- AI might generate fake contact info
- No warning to user or in logs

### Proposed Fix

```python
def _preserve_personal_info(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Preserve personal info from original, return warnings if unable."""
    warnings = []

    if not original_data:
        warnings.append("Original resume data unavailable - personal info may be AI-generated")
        return improved_data, warnings

    original_info = original_data.get("personalInfo")
    if not isinstance(original_info, dict):
        warnings.append("Original personal info missing or invalid")
        return improved_data, warnings

    # Use deep copy to prevent mutation
    import copy
    result = copy.deepcopy(improved_data)
    result["personalInfo"] = copy.deepcopy(original_info)

    return result, warnings
```

---

## API-007: Diff Calculation Silent Failure

**Severity:** LOW
**Location:** `apps/backend/app/routers/resumes.py:164-181`

### Description

Resume diff calculation failures are logged as warnings and silently skipped.

### Current Code

```python
def _calculate_diff_from_resume(
    resume: dict[str, Any],
    improved_data: dict[str, Any],
) -> tuple[ResumeDiffSummary | None, list[ResumeFieldDiff] | None]:
    original_data = _get_original_resume_data(resume)
    if not original_data:
        return None, None  # Silent skip
    from app.services.improver import calculate_resume_diff
    try:
        return calculate_resume_diff(original_data, improved_data)
    except Exception as e:
        logger.warning("Skipping resume diff due to calculation failure: %s", e)
        return None, None  # Silent skip
```

### Impact

- Users don't see what changed
- Happens without error or status code change
- At lines 534-537 and 632-635, `diff_summary` and `detailed_changes` are simply None

### Proposed Fix

```python
def _calculate_diff_from_resume(
    resume: dict[str, Any],
    improved_data: dict[str, Any],
) -> tuple[ResumeDiffSummary | None, list[ResumeFieldDiff] | None, str | None]:
    """Calculate diff, returning (summary, changes, error_reason)."""
    original_data = _get_original_resume_data(resume)
    if not original_data:
        return None, None, "original_data_missing"

    try:
        summary, changes = calculate_resume_diff(original_data, improved_data)
        return summary, changes, None
    except Exception as e:
        logger.warning("Diff calculation failed: %s", e)
        return None, None, f"calculation_error: {str(e)}"

# In response:
if diff_error:
    response.warnings.append(f"Could not calculate changes: {diff_error}")
```

---

## API-008: Refinement Silent Fallback

**Severity:** LOW
**Location:** `apps/backend/app/routers/resumes.py:510-511, 784-785`

### Description

Multi-pass refinement can fail without stopping the operation. Endpoint returns 200 OK with unrefined resume.

### Current Code

```python
try:
    # ... refinement logic ...
except Exception as e:
    logger.warning("Refinement failed, using unrefined result: %s", e)
```

### Impact

- Endpoint returns 200 OK with warnings in logs only
- Client gets unrefined resume without knowing
- No indication in response that refinement failed
- `refinement_stats` is None when this happens

### Proposed Fix

```python
class ImproveResumeResponse(BaseModel):
    # ... existing fields ...
    refinement_attempted: bool = False
    refinement_successful: bool = False
    refinement_error: str | None = None

# In handler:
try:
    refinement_result = await refine_resume(...)
    response.refinement_attempted = True
    response.refinement_successful = True
except Exception as e:
    logger.warning("Refinement failed: %s", e)
    response.refinement_attempted = True
    response.refinement_successful = False
    response.refinement_error = "Refinement failed - using base improved resume"
```

---

## API-009: Auxiliary Message Generation Partial Failures

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:206-243`

### Description

Cover letter and outreach message generation failures don't fail the request.

### Current Code

```python
async def _generate_auxiliary_messages(...) -> tuple[str | None, str | None]:
    if generation_tasks:
        results = await asyncio.gather(*generation_tasks, return_exceptions=True)
        idx = 0
        if enable_cover_letter:
            result = results[idx]
            if not isinstance(result, Exception):
                cover_letter = result
            else:
                logger.warning("Cover letter generation failed: %s", result)
            idx += 1
```

### Impact

- User requests cover letter but gets None without knowing why
- No error status code
- Response model allows `cover_letter: str | None` so silently succeeds

### Proposed Fix

```python
async def _generate_auxiliary_messages(...) -> AuxiliaryGenerationResult:
    result = AuxiliaryGenerationResult()

    if enable_cover_letter:
        try:
            result.cover_letter = await generate_cover_letter(...)
            result.cover_letter_status = "success"
        except Exception as e:
            logger.warning("Cover letter generation failed: %s", e)
            result.cover_letter_status = "failed"
            result.cover_letter_error = str(e)

    # Similar for outreach
    return result

class AuxiliaryGenerationResult(BaseModel):
    cover_letter: str | None = None
    cover_letter_status: Literal["success", "failed", "not_requested"] = "not_requested"
    cover_letter_error: str | None = None
    outreach_message: str | None = None
    outreach_status: Literal["success", "failed", "not_requested"] = "not_requested"
    outreach_error: str | None = None
```

---

## API-010: Hash Validation Race Condition

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:602-629`

### Description

Preview hash validation has fallback logic and race conditions that could allow stale previews.

### Current Code

```python
preview_hashes = job.get("preview_hashes")
allowed_hashes: set[str] = set()
if isinstance(preview_hashes, dict):
    allowed_hashes.update(preview_hashes.values())
elif isinstance(preview_hashes, list):
    allowed_hashes.update([value for value in preview_hashes if isinstance(value, str)])
else:
    preview_hash = job.get("preview_hash")
    if isinstance(preview_hash, str):
        allowed_hashes.add(preview_hash)

if not allowed_hashes:
    logger.warning("Rejecting confirm; preview hash missing for job %s.", request.job_id)
    raise HTTPException(...)
```

### Impact

- Multiple hash versions stored (dict values, list values, single value)
- Race condition: concurrent previews can overwrite preview_hashes
- Confirmation can accept outdated hash if multiple previews were generated
- No transaction consistency

### Proposed Fix

```python
def _validate_preview_hash(
    job: dict,
    request_hash: str,
    prompt_id: str
) -> tuple[bool, str]:
    """Validate preview hash with strict prompt_id matching."""
    preview_hashes = job.get("preview_hashes", {})

    if not isinstance(preview_hashes, dict):
        return False, "Invalid preview_hashes format"

    expected_hash = preview_hashes.get(prompt_id)
    if not expected_hash:
        return False, f"No preview found for prompt_id: {prompt_id}"

    if request_hash != expected_hash:
        return False, "Preview hash mismatch - data may have changed"

    return True, ""

# Usage:
is_valid, error = _validate_preview_hash(job, request_hash, request.prompt_id)
if not is_valid:
    raise HTTPException(status_code=400, detail=error)
```

---

## API-011: Update Return Value Not Checked

**Severity:** MEDIUM
**Location:** `apps/backend/app/database.py:105-106`

### Description

`update_resume()` silently succeeds even if no records matched. Callers don't validate None return.

### Current Code

```python
def update_resume(self, resume_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    Resume = Query()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    self.resumes.update(updates, Resume.resume_id == resume_id)
    return self.get_resume(resume_id)  # May return None
```

### Impact

- `self.resumes.update()` returns count, but is ignored
- If resume_id doesn't exist, `get_resume()` returns None
- Many callers at lines 307, 319, 434, 521 don't validate None return

### Proposed Fix

```python
def update_resume(self, resume_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Update resume. Raises ValueError if resume not found."""
    Resume = Query()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    updated_count = self.resumes.update(updates, Resume.resume_id == resume_id)

    if not updated_count:
        raise ValueError(f"Resume not found: {resume_id}")

    result = self.get_resume(resume_id)
    if not result:
        raise ValueError(f"Resume disappeared after update: {resume_id}")

    return result

# Callers should handle:
try:
    updated = db.update_resume(resume_id, updates)
except ValueError as e:
    raise HTTPException(status_code=404, detail=str(e))
```

---

## API-012: Improvement Record Not Found Generic Error

**Severity:** LOW
**Location:** `apps/backend/app/routers/resumes.py:1055-1061`

### Description

Missing improvement record doesn't clearly indicate what happened.

### Current Code

```python
improvement = db.get_improvement_by_tailored_resume(resume_id)
if not improvement:
    raise HTTPException(
        status_code=400,
        detail="No job context found for this resume. "
        "The resume may have been created before job tracking was implemented.",
    )
```

### Impact

- Error message suggests old data but could mean:
  - Improvement record was deleted
  - Resume ID doesn't match any improvement
  - Database corruption
- No logging of which resume_id failed to find

### Proposed Fix

```python
improvement = db.get_improvement_by_tailored_resume(resume_id)
if not improvement:
    # Log for debugging
    logger.warning(
        "No improvement record found for resume %s. "
        "Resume exists: %s, Is tailored: %s",
        resume_id,
        db.get_resume(resume_id) is not None,
        resume.get("parent_id") is not None,
    )

    # Return specific error based on context
    if not resume.get("parent_id"):
        detail = "This is a master resume, not a tailored resume."
    else:
        detail = "Job context not found. The improvement record may have been deleted."

    raise HTTPException(status_code=400, detail=detail)
```

---

## API-013: Processed Data Weak Validation

**Severity:** LOW
**Location:** `apps/backend/app/routers/resumes.py:653-654`

### Description

When confirming, `improved_data` is passed as `processed_data` with weak validation.

### Current Code

```python
tailored_resume = db.create_resume(
    content=improved_text,
    content_type="json",
    filename=f"tailored_{resume.get('filename', 'resume')}",
    is_master=False,
    parent_id=request.resume_id,
    processed_data=improved_data,  # Could be partial/incomplete
    processing_status="ready",
    cover_letter=cover_letter,
    outreach_message=outreach_message,
)
```

### Impact

- If `request.improved_data.model_dump()` fails, error propagates
- But `improved_data` could be partial/incomplete
- No secondary validation after extraction

### Proposed Fix

```python
# Validate improved_data before storing
try:
    validated_data = ResumeData.model_validate(improved_data)
except ValidationError as e:
    logger.error("Invalid improved_data in confirm: %s", e)
    raise HTTPException(
        status_code=422,
        detail="The improved resume data is invalid. Please regenerate the preview."
    )

tailored_resume = db.create_resume(
    ...,
    processed_data=validated_data.model_dump(),
    ...
)
```
