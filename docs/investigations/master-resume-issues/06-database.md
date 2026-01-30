# Database (TinyDB) Issues

> **Component:** `apps/backend/app/database.py`, `apps/backend/data/`
> **Issues Found:** 9
> **Critical:** 2 | **High:** 3 | **Medium:** 4

---

## Table of Contents

1. [DB-001: Race Condition in Preview Hash Storage](#db-001-race-condition-in-preview-hash-storage)
2. [DB-002: No Error Handling for Critical DB Writes](#db-002-no-error-handling-for-critical-db-writes)
3. [DB-003: Inconsistent Database Return Values](#db-003-inconsistent-database-return-values)
4. [DB-004: Missing Return Value Checks on create_resume](#db-004-missing-return-value-checks-on-create_resume)
5. [DB-005: No Atomic Transactions for Multi-Step Operations](#db-005-no-atomic-transactions-for-multi-step-operations)
6. [DB-006: Unguarded State Changes in set_master_resume](#db-006-unguarded-state-changes-in-set_master_resume)
7. [DB-007: No Concurrency Protection](#db-007-no-concurrency-protection)
8. [DB-008: No Validation of processed_data Before Storage](#db-008-no-validation-of-processed_data-before-storage)
9. [DB-009: Redundant ID Systems](#db-009-redundant-id-systems)

---

## DB-001: Race Condition in Preview Hash Storage

**Severity:** CRITICAL
**Location:** `apps/backend/app/routers/resumes.py:515-526`

### Description

The preview hash update uses a read-modify-write pattern without any locking, creating a classic race condition.

### Current Code

```python
preview_hashes = job.get("preview_hashes")  # Line 515: Read
if not isinstance(preview_hashes, dict):
    preview_hashes = {}
preview_hashes[prompt_id] = preview_hash    # Line 518: Modify in memory
# NOTE: preview_hashes updates are last-write-wins; concurrent previews can race.
try:
    updated_job = db.update_job(               # Line 521-527: Write
        request.job_id,
        {
            "preview_hash": preview_hash,
            "preview_prompt_id": prompt_id,
            "preview_hashes": preview_hashes,
        },
    )
```

### Impact

Two concurrent `/improve/preview` requests can:
1. Both read the same `preview_hashes` dictionary
2. Both modify their copy independently
3. One write overwrites the other
4. A preview hash is lost, invalidating the confirm operation for that preview

**The code even acknowledges this:** `# NOTE: preview_hashes updates are last-write-wins; concurrent previews can race.`

### Proposed Fix

```python
import threading
from contextlib import contextmanager

# Job-level locks for preview hash updates
_job_locks: dict[str, threading.Lock] = {}
_job_locks_lock = threading.Lock()

@contextmanager
def job_lock(job_id: str):
    """Acquire lock for a specific job."""
    with _job_locks_lock:
        if job_id not in _job_locks:
            _job_locks[job_id] = threading.Lock()
        lock = _job_locks[job_id]

    lock.acquire()
    try:
        yield
    finally:
        lock.release()

# Usage:
with job_lock(request.job_id):
    # Re-read to get latest state
    job = db.get_job(request.job_id)
    preview_hashes = job.get("preview_hashes", {})
    preview_hashes[prompt_id] = preview_hash

    db.update_job(
        request.job_id,
        {"preview_hashes": preview_hashes}
    )
```

---

## DB-002: No Error Handling for Critical DB Writes

**Severity:** CRITICAL
**Location:** Multiple locations in `apps/backend/app/routers/resumes.py`

### Description

Several database writes are fire-and-forget with no return value validation. API returns success without verifying the write succeeded.

### Affected Locations

**Line 1013 - Cover Letter Update:**
```python
db.update_resume(resume_id, {"cover_letter": request.content})
return {"message": "Cover letter updated successfully"}
# No check if update actually succeeded!
```

**Line 1026 - Outreach Message Update:**
```python
db.update_resume(resume_id, {"outreach_message": request.content})
return {"message": "Outreach message updated successfully"}
# Same issue
```

**Lines 1095, 1166 - Generated Content:**
```python
db.update_resume(resume_id, {"cover_letter": cover_letter_content})
# Returns success without checking if DB write succeeded
```

### Impact

- `update_resume()` returns `dict[str, Any] | None`
- Callers don't check for `None` return
- If TinyDB fails to persist data, API still returns 200 success
- User thinks data is saved when it's actually lost

### Proposed Fix

```python
def update_resume_or_fail(
    db: Database,
    resume_id: str,
    updates: dict[str, Any],
    operation: str = "update"
) -> dict[str, Any]:
    """Update resume with error handling."""
    result = db.update_resume(resume_id, updates)

    if result is None:
        logger.error(
            "Database %s failed for resume %s: %s",
            operation, resume_id, updates.keys()
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to {operation} resume. Please try again."
        )

    return result

# Usage:
update_resume_or_fail(db, resume_id, {"cover_letter": request.content}, "save cover letter")
return {"message": "Cover letter updated successfully"}
```

---

## DB-003: Inconsistent Database Return Values

**Severity:** MEDIUM
**Location:** `apps/backend/app/database.py:84-106`

### Description

`create_resume()` and `update_resume()` have different return semantics.

### Current Code

```python
# Line 84-85: create_resume returns the local doc BEFORE insertion
def create_resume(...) -> dict[str, Any]:
    doc = {...}
    self.resumes.insert(doc)  # insert() doesn't return the doc!
    return doc  # Returns the prepared doc, not what was actually stored

# Line 106: update_resume does a separate read-back
def update_resume(...) -> dict[str, Any] | None:
    self.resumes.update(updates, Resume.resume_id == resume_id)
    return self.get_resume(resume_id)  # Reads back from DB
```

### Impact

- `create_resume()` returns the in-memory document without verifying insertion
- If TinyDB insertion fails silently, calling code gets a document dict but it's not in the database
- `update_resume()` correctly reads back, but inconsistency confuses developers

### Proposed Fix

```python
def create_resume(
    self,
    content: str,
    content_type: str,
    filename: str,
    is_master: bool = False,
    parent_id: str | None = None,
    processed_data: dict[str, Any] | None = None,
    processing_status: str = "pending",
    cover_letter: str | None = None,
    outreach_message: str | None = None,
) -> dict[str, Any]:
    """Create a new resume and return the stored document."""
    resume_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "resume_id": resume_id,
        "content": content,
        "content_type": content_type,
        "filename": filename,
        "is_master": is_master,
        "parent_id": parent_id,
        "processed_data": processed_data,
        "processing_status": processing_status,
        "cover_letter": cover_letter,
        "outreach_message": outreach_message,
        "created_at": now,
        "updated_at": now,
    }

    # Insert and get TinyDB doc_id
    doc_id = self.resumes.insert(doc)

    if not doc_id:
        raise RuntimeError(f"Failed to insert resume: {resume_id}")

    # Read back to confirm insertion
    stored = self.get_resume(resume_id)
    if not stored:
        raise RuntimeError(f"Resume not found after insertion: {resume_id}")

    return stored
```

---

## DB-004: Missing Return Value Checks on create_resume

**Severity:** HIGH
**Location:** `apps/backend/app/routers/resumes.py:647-667, 809-828`

### Description

Code assumes `create_resume()` always succeeds and immediately uses the returned document.

### Current Code

```python
# Line 647-657: Confirm endpoint
tailored_resume = db.create_resume(...)  # No error handling
# Directly uses: tailored_resume["resume_id"] at line 664
db.create_improvement(
    original_resume_id=request.resume_id,
    tailored_resume_id=tailored_resume["resume_id"],  # Assumes success
    ...
)

# Line 809-828: Improve endpoint - same pattern
tailored_resume = db.create_resume(...)  # No try-catch
db.create_improvement(
    ...
    tailored_resume_id=tailored_resume["resume_id"],  # Could fail silently
)
```

### Impact

If `create_resume()` fails (corrupted DB, disk full, etc.):
1. The document dict will still be returned (current implementation)
2. The resume won't actually exist in the database
3. The improvement record will reference a non-existent resume_id
4. The API returns 200 OK with a resume_id that doesn't work when fetched

### Proposed Fix

```python
try:
    tailored_resume = db.create_resume(
        content=improved_text,
        content_type="json",
        filename=f"tailored_{resume.get('filename', 'resume')}",
        is_master=False,
        parent_id=request.resume_id,
        processed_data=improved_data,
        processing_status="ready",
        cover_letter=cover_letter,
        outreach_message=outreach_message,
    )
except Exception as e:
    logger.error("Failed to create tailored resume: %s", e)
    raise HTTPException(
        status_code=500,
        detail="Failed to save tailored resume. Please try again."
    )

# Verify the resume was actually created
verification = db.get_resume(tailored_resume["resume_id"])
if not verification:
    logger.error(
        "Resume verification failed: %s not found after creation",
        tailored_resume["resume_id"]
    )
    raise HTTPException(
        status_code=500,
        detail="Resume creation could not be verified. Please try again."
    )
```

---

## DB-005: No Atomic Transactions for Multi-Step Operations

**Severity:** HIGH
**Location:** Entire improve/confirm flow (lines 646-668, 808-828)

### Description

The resume improvement process requires 2 database writes with no atomicity.

### Current Code

```python
# Step 1: Create tailored resume
tailored_resume = db.create_resume(...)        # Line 647

# Step 2: Create improvement record
db.create_improvement(...)                     # Line 662
```

### Impact

**If step 1 succeeds but step 2 fails:**
- Orphaned tailored resume with no improvement record
- Can't fetch context for cover letter generation
- API returns error, but resume is already created

**If step 2 succeeds but step 1 fails:**
- Improvement record references non-existent resume
- Logic errors when trying to fetch the tailored resume

**Current state:** No rollback mechanism. TinyDB has no transaction support.

### Proposed Fix

```python
class DatabaseTransaction:
    """Simple transaction wrapper for multi-step operations."""

    def __init__(self, db: Database):
        self.db = db
        self.created_resumes: list[str] = []
        self.created_improvements: list[str] = []
        self.committed = False

    def create_resume(self, **kwargs) -> dict[str, Any]:
        resume = self.db.create_resume(**kwargs)
        self.created_resumes.append(resume["resume_id"])
        return resume

    def create_improvement(self, **kwargs) -> dict[str, Any]:
        improvement = self.db.create_improvement(**kwargs)
        self.created_improvements.append(improvement["request_id"])
        return improvement

    def commit(self):
        """Mark transaction as successful."""
        self.committed = True

    def rollback(self):
        """Undo all operations in this transaction."""
        if self.committed:
            return

        for resume_id in self.created_resumes:
            try:
                self.db.delete_resume(resume_id)
            except Exception as e:
                logger.error("Rollback failed for resume %s: %s", resume_id, e)

        for improvement_id in self.created_improvements:
            try:
                self.db.delete_improvement(improvement_id)
            except Exception as e:
                logger.error("Rollback failed for improvement %s: %s", improvement_id, e)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        return False

# Usage:
with DatabaseTransaction(db) as txn:
    tailored_resume = txn.create_resume(...)
    txn.create_improvement(
        original_resume_id=request.resume_id,
        tailored_resume_id=tailored_resume["resume_id"],
        ...
    )
    txn.commit()  # Only commit if both succeed
```

---

## DB-006: Unguarded State Changes in set_master_resume

**Severity:** HIGH
**Location:** `apps/backend/app/database.py:118-127`

### Description

Two-step update with no atomicity creates a window where no resume is master.

### Current Code

```python
def set_master_resume(self, resume_id: str) -> bool:
    Resume = Query()
    # Step 1: Unset current master
    self.resumes.update({"is_master": False}, Resume.is_master == True)  # Line 122
    # Step 2: Set new master
    updated = self.resumes.update(
        {"is_master": True}, Resume.resume_id == resume_id  # Line 125
    )
    return len(updated) > 0
```

### Impact

- Between step 1 and 2, there's a window where NO resume is marked as master
- If step 2 fails (resume doesn't exist), all resumes are non-masters
- No transaction to guarantee atomicity
- Exception in step 2 leaves the database in broken state

### Proposed Fix

```python
import threading

_master_resume_lock = threading.Lock()

def set_master_resume(self, resume_id: str) -> bool:
    """Set a resume as master atomically."""
    Resume = Query()

    with _master_resume_lock:
        # First verify the target resume exists
        target = self.resumes.search(Resume.resume_id == resume_id)
        if not target:
            logger.warning("Cannot set master: resume %s not found", resume_id)
            return False

        # Get current master for rollback if needed
        current_master = self.resumes.search(Resume.is_master == True)
        current_master_id = current_master[0]["resume_id"] if current_master else None

        try:
            # Unset current master
            self.resumes.update({"is_master": False}, Resume.is_master == True)

            # Set new master
            updated = self.resumes.update(
                {"is_master": True}, Resume.resume_id == resume_id
            )

            if len(updated) == 0:
                # Rollback: restore previous master
                if current_master_id:
                    self.resumes.update(
                        {"is_master": True},
                        Resume.resume_id == current_master_id
                    )
                return False

            return True

        except Exception as e:
            logger.error("Error setting master resume: %s", e)
            # Attempt rollback
            if current_master_id:
                try:
                    self.resumes.update(
                        {"is_master": True},
                        Resume.resume_id == current_master_id
                    )
                except Exception:
                    logger.error("Rollback failed!")
            raise
```

---

## DB-007: No Concurrency Protection

**Severity:** CRITICAL
**Location:** `apps/backend/app/database.py:14-48`

### Description

TinyDB is used without any concurrency protection for multi-threaded access.

### Current Code

```python
class Database:
    def __init__(self, db_path: Path | None = None):
        self._db: TinyDB | None = None

    @property
    def db(self) -> TinyDB:
        if self._db is None:
            self._db = TinyDB(self.db_path)  # Line 26 - No thread lock
        return self._db
```

### Impact

**No global lock:** Multiple FastAPI worker threads can access TinyDB simultaneously

**Lazy initialization race:** The `@property` accessor creates the singleton without synchronization

**TinyDB file locking:**
- TinyDB uses file-based locking on the JSON file, but:
- Windows file locking differs from Unix
- No handling for lock timeout/deadlock scenarios
- JSON file is completely rewritten on each update (read-modify-write at file level)

**Under concurrent load (multiple resume uploads/improvements):**
- Database writes can interfere with each other
- Data corruption possible if writes overlap during JSON serialization
- No guarantee of data consistency

### Proposed Fix

```python
import threading
from typing import TypeVar, Callable

T = TypeVar('T')

class Database:
    _instance: "Database | None" = None
    _instance_lock = threading.Lock()
    _db_lock = threading.RLock()  # Reentrant lock for nested operations

    def __new__(cls, db_path: Path | None = None):
        """Thread-safe singleton."""
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, db_path: Path | None = None):
        if self._initialized:
            return
        self._initialized = True
        self.db_path = db_path or Path("data/database.json")
        self._db: TinyDB | None = None

    @property
    def db(self) -> TinyDB:
        with self._db_lock:
            if self._db is None:
                self._db = TinyDB(self.db_path)
            return self._db

    def _with_lock(self, operation: Callable[[], T]) -> T:
        """Execute operation with database lock."""
        with self._db_lock:
            return operation()

    def create_resume(self, ...) -> dict[str, Any]:
        def _create():
            # ... existing implementation
            pass
        return self._with_lock(_create)

    def update_resume(self, resume_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        def _update():
            # ... existing implementation
            pass
        return self._with_lock(_update)
```

---

## DB-008: No Validation of processed_data Before Storage

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:305-313`

### Description

Parsed resume data is stored without validation.

### Current Code

```python
try:
    processed_data = await parse_resume_to_json(markdown_content)
    db.update_resume(
        resume["resume_id"],
        {
            "processed_data": processed_data,  # No schema validation!
            "processing_status": "ready",
        },
    )
except Exception as e:
    logger.warning(f"Resume parsing to JSON failed for {file.filename}: {e}")
    db.update_resume(resume["resume_id"], {"processing_status": "failed"})
```

### Impact

- `processed_data` could be malformed JSON or missing required fields
- If LLM returns invalid data, it's stored in the database as-is
- Later enrichment operations assume well-formed data and can crash

### Proposed Fix

```python
from app.schemas.models import ResumeData

try:
    processed_data = await parse_resume_to_json(markdown_content)

    # Validate before storing
    try:
        validated = ResumeData.model_validate(processed_data)
        processed_data = validated.model_dump()
    except ValidationError as ve:
        logger.error("Resume data validation failed: %s", ve)
        raise ValueError(f"Invalid resume structure: {ve}")

    db.update_resume(
        resume["resume_id"],
        {
            "processed_data": processed_data,
            "processing_status": "ready",
            "validated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
except ValueError as e:
    logger.warning(f"Resume validation failed for {file.filename}: {e}")
    db.update_resume(
        resume["resume_id"],
        {
            "processing_status": "failed",
            "processing_error": str(e),
        }
    )
except Exception as e:
    logger.warning(f"Resume parsing failed for {file.filename}: {e}")
    db.update_resume(resume["resume_id"], {"processing_status": "failed"})
```

---

## DB-009: Redundant ID Systems

**Severity:** LOW
**Location:** `apps/backend/app/database.py` (entire)

### Description

Custom UUID keys are used alongside TinyDB's internal IDs.

### Current Code

```python
resume_id = str(uuid4())  # Custom ID
doc = {
    "resume_id": resume_id,  # Manual key
    ...
}
self.resumes.insert(doc)  # TinyDB also generates internal doc_id (1, 2, 3...)
```

### Impact

- Two ID systems running in parallel (inefficient)
- Query performance: searching by `resume_id` requires full table scan (no index)
- Stored database.json has redundant ID data
- Memory overhead storing custom UUIDs as strings

### Current Database Structure

```json
{
  "resumes": {
    "1": { "resume_id": "uuid-here", ... },
    "2": { "resume_id": "uuid-here", ... }
  }
}
```

### Proposed Fix (Long-term)

```python
# Option 1: Use TinyDB doc_ids as primary key (simpler, but loses UUID benefits)
def create_resume(self, ...) -> dict[str, Any]:
    doc = {
        "content": content,
        # ... other fields, no resume_id
    }
    doc_id = self.resumes.insert(doc)
    return {"id": doc_id, **doc}

# Option 2: Migrate to SQLite for better querying and indexing
# SQLite supports:
# - Proper indexes on UUID columns
# - ACID transactions
# - Better concurrent access
# - Query performance

import sqlite3

class SQLiteDatabase:
    def __init__(self, db_path: Path):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._create_tables()

    def _create_tables(self):
        self.conn.execute('''
            CREATE TABLE IF NOT EXISTS resumes (
                resume_id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                content_type TEXT,
                filename TEXT,
                is_master BOOLEAN DEFAULT FALSE,
                parent_id TEXT,
                processed_data JSON,
                processing_status TEXT DEFAULT 'pending',
                cover_letter TEXT,
                outreach_message TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        ''')
        self.conn.execute('''
            CREATE INDEX IF NOT EXISTS idx_resumes_is_master
            ON resumes(is_master)
        ''')
        self.conn.commit()
```

---

## Summary: Data at Risk

Based on the issues identified, the following data is at risk of loss or corruption:

| Data Type | Risk | Cause |
|-----------|------|-------|
| Cover letters & outreach | HIGH | Fire-and-forget writes without validation |
| Preview hashes | HIGH | Race condition on concurrent previews |
| Tailored resumes | MEDIUM | Can be created but not linked to improvements |
| Master resume status | MEDIUM | Can revert to no-master state during set |
| Processed resume data | MEDIUM | Stored without validation, could be incomplete |
| All data | LOW | TinyDB corruption under concurrent load |

---

## Migration Path

For a production application, consider migrating from TinyDB to SQLite:

1. **Phase 1:** Add write locking around all TinyDB operations
2. **Phase 2:** Create SQLite schema matching current data model
3. **Phase 3:** Write migration script to copy data
4. **Phase 4:** Add feature flag to switch between backends
5. **Phase 5:** Run both in parallel, comparing results
6. **Phase 6:** Switch to SQLite as primary
7. **Phase 7:** Remove TinyDB code
