# JSON Schema & Parsing Issues

> **Component:** `apps/backend/app/schemas/`, `apps/backend/app/llm.py`
> **Issues Found:** 12
> **Critical:** 1 | **High:** 3 | **Medium:** 8

---

## Table of Contents

1. [JSON-001: Unsafe JSON Loading Without Error Handling](#json-001-unsafe-json-loading-without-error-handling)
2. [JSON-002: Missing Type Validation in CustomSection](#json-002-missing-type-validation-in-customsection)
3. [JSON-003: Dict Keys Without Validation](#json-003-dict-keys-without-validation)
4. [JSON-004: Overly Permissive RefinementResult](#json-004-overly-permissive-refinementresult)
5. [JSON-005: RawResume ID Type Inconsistency](#json-005-rawresume-id-type-inconsistency)
6. [JSON-006: JSON Round-trip Serialization Loss](#json-006-json-round-trip-serialization-loss)
7. [JSON-007: Inconsistent Unicode Normalization](#json-007-inconsistent-unicode-normalization)
8. [JSON-008: Asymmetric Null Handling in Personal Info](#json-008-asymmetric-null-handling-in-personal-info)
9. [JSON-009: Optional Fields Allow Incomplete Data](#json-009-optional-fields-allow-incomplete-data)
10. [JSON-010: Deep Nesting in JSON Extraction](#json-010-deep-nesting-in-json-extraction)
11. [JSON-011: Hash Mismatch Susceptibility](#json-011-hash-mismatch-susceptibility)
12. [JSON-012: String Forward Reference Inconsistency](#json-012-string-forward-reference-inconsistency)

---

## JSON-001: Unsafe JSON Loading Without Error Handling

**Severity:** CRITICAL
**Location:** `apps/backend/app/routers/resumes.py:60`

### Description

JSON file loading doesn't have try-except for malformed JSON, causing app crashes.

### Current Code

```python
def _load_config() -> dict:
    config_path = settings.config_path
    if config_path.exists():
        return json.loads(config_path.read_text())  # Will crash on malformed JSON
    return {}
```

### Comparison with Safe Implementation

```python
# apps/backend/app/config.py:22-24 (GOOD)
try:
    return json.loads(CONFIG_FILE_PATH.read_text())
except (json.JSONDecodeError, OSError):
    return {}
```

### Impact

- If config.json is malformed, entire application crashes
- No graceful degradation
- Inconsistent error handling across modules

### Proposed Fix

```python
def _load_config() -> dict:
    """Load configuration with error handling."""
    config_path = settings.config_path
    if not config_path.exists():
        return {}

    try:
        content = config_path.read_text()
        return json.loads(content)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse config JSON: %s", e)
        return {}
    except OSError as e:
        logger.error("Failed to read config file: %s", e)
        return {}
```

---

## JSON-002: Missing Type Validation in CustomSection

**Severity:** MEDIUM
**Location:** `apps/backend/app/schemas/models.py:100-107`

### Description

No validation that `sectionType` matches the populated field in CustomSection.

### Current Code

```python
class CustomSection(BaseModel):
    sectionType: SectionType
    items: list[CustomSectionItem] | None = None  # For ITEM_LIST
    strings: list[str] | None = None              # For STRING_LIST
    text: str | None = None                       # For TEXT
```

### Impact

- A `CustomSection` with `sectionType="itemList"` could have `text` populated instead of `items`
- Causes downstream JSON parsing failures
- Unexpected schema mismatches
- Silent data loss when serialized

### Proposed Fix

```python
class CustomSection(BaseModel):
    sectionType: SectionType
    items: list[CustomSectionItem] | None = None
    strings: list[str] | None = None
    text: str | None = None

    @model_validator(mode="after")
    def validate_section_type_matches_data(self) -> "CustomSection":
        """Ensure the populated field matches sectionType."""
        if self.sectionType == SectionType.ITEM_LIST:
            if self.items is None:
                raise ValueError("sectionType 'itemList' requires 'items' field")
            if self.strings is not None or self.text is not None:
                raise ValueError("sectionType 'itemList' should only have 'items' field")
        elif self.sectionType == SectionType.STRING_LIST:
            if self.strings is None:
                raise ValueError("sectionType 'stringList' requires 'strings' field")
            if self.items is not None or self.text is not None:
                raise ValueError("sectionType 'stringList' should only have 'strings' field")
        elif self.sectionType == SectionType.TEXT:
            if self.text is None:
                raise ValueError("sectionType 'text' requires 'text' field")
            if self.items is not None or self.strings is not None:
                raise ValueError("sectionType 'text' should only have 'text' field")
        return self
```

---

## JSON-003: Dict Keys Without Validation

**Severity:** MEDIUM
**Location:** `apps/backend/app/schemas/models.py:196`

### Description

Dictionary keys in `customSections` are arbitrary strings with no uniqueness/format validation.

### Current Code

```python
customSections: dict[str, CustomSection] = Field(default_factory=dict)
```

### Impact

Pydantic will accept problematic keys:
- Empty string keys: `{"": CustomSection(...)}`
- Keys with special characters: `{"$@#": CustomSection(...)}`
- Duplicate-like keys: `{"section_1": ..., "Section_1": ...}`

This causes:
- Frontend/backend key mapping mismatches
- JSON truncation when keys contain escape sequences
- Serialization round-trip failures

### Proposed Fix

```python
import re

class ResumeData(BaseModel):
    customSections: dict[str, CustomSection] = Field(default_factory=dict)

    @field_validator("customSections", mode="before")
    @classmethod
    def validate_section_keys(cls, v: dict) -> dict:
        """Validate custom section keys."""
        if not isinstance(v, dict):
            return v

        key_pattern = re.compile(r'^[a-zA-Z][a-zA-Z0-9_-]{0,49}$')
        normalized_keys = set()

        for key in v.keys():
            if not key:
                raise ValueError("Custom section key cannot be empty")
            if not key_pattern.match(key):
                raise ValueError(
                    f"Invalid section key '{key}': must start with letter, "
                    "contain only alphanumeric, underscore, hyphen"
                )
            normalized = key.lower()
            if normalized in normalized_keys:
                raise ValueError(f"Duplicate section key (case-insensitive): {key}")
            normalized_keys.add(normalized)

        return v
```

---

## JSON-004: Overly Permissive RefinementResult

**Severity:** HIGH
**Location:** `apps/backend/app/schemas/refinement.py:90-100`

### Description

`refined_data: dict` accepts ANY dictionary structure without schema validation.

### Current Code

```python
class RefinementResult(BaseModel):
    refined_data: dict = Field(default_factory=dict)  # NO TYPE VALIDATION
    keyword_analysis: KeywordGapAnalysis | None = None
    alignment_report: AlignmentReport | None = None
```

### Impact

- Invalid resume structures can be returned
- Missing required fields like `personalInfo`
- Type mismatches in nested structures
- Downstream crashes in `to_stats()` method if `self.keyword_analysis` is None

### Crash Point

```python
len(self.keyword_analysis.injectable_keywords)  # AttributeError if None
```

### Proposed Fix

```python
from app.schemas.models import ResumeData

class RefinementResult(BaseModel):
    refined_data: ResumeData  # Use typed schema
    keyword_analysis: KeywordGapAnalysis | None = None
    alignment_report: AlignmentReport | None = None
    passes_completed: int = 0
    ai_phrases_removed: int = 0

    def to_stats(self) -> dict:
        """Convert to stats dict with null safety."""
        return {
            "passes_completed": self.passes_completed,
            "keywords_injected": (
                len(self.keyword_analysis.injectable_keywords)
                if self.keyword_analysis and self.keyword_analysis.injectable_keywords
                else 0
            ),
            "ai_phrases_removed": self.ai_phrases_removed,
            "alignment_violations": (
                len(self.alignment_report.violations)
                if self.alignment_report and self.alignment_report.violations
                else 0
            ),
        }
```

---

## JSON-005: RawResume ID Type Inconsistency

**Severity:** LOW
**Location:** `apps/backend/app/schemas/models.py:211`

### Description

Type union allows integer ID but TinyDB doesn't use numeric IDs.

### Current Code

```python
class RawResume(BaseModel):
    id: int | None = None  # TinyDB doesn't have numeric IDs
```

### Impact

- Type union without validation
- Code comment indicates IDs are never numeric
- Inconsistent and confusing for API consumers

### Proposed Fix

```python
class RawResume(BaseModel):
    # TinyDB internal doc_id (integer) - rarely used
    doc_id: int | None = Field(default=None, exclude=True)
    # Application-level UUID - primary identifier
    resume_id: str | None = None
```

---

## JSON-006: JSON Round-trip Serialization Loss

**Severity:** MEDIUM
**Location:** `apps/backend/app/services/refiner.py:473`

### Description

Intentional JSON round-trip can lose data.

### Current Code

```python
return json.loads(json.dumps(data))
```

### Impact

- Pydantic model validation is skipped
- Special values (NaN, Infinity) become null
- Datetime objects become strings without proper formatting
- Unicode normalization is not guaranteed

### Proposed Fix

```python
import copy
from typing import Any

def _deep_copy(data: dict[str, Any]) -> dict[str, Any]:
    """Create a deep copy of a dictionary.

    Uses copy.deepcopy for reliability. JSON serialization is avoided
    because it can't handle all Python types and loses type information.
    """
    return copy.deepcopy(data)

# If JSON serialization is intentional (for sanitization):
def _sanitize_for_json(data: dict[str, Any]) -> dict[str, Any]:
    """Deep copy via JSON to ensure JSON-serializable output."""
    try:
        return json.loads(json.dumps(data, default=str))
    except (TypeError, ValueError) as e:
        logger.warning("JSON sanitization failed: %s, using deepcopy", e)
        return copy.deepcopy(data)
```

---

## JSON-007: Inconsistent Unicode Normalization

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:88-129`

### Description

Unicode normalization is applied inconsistently - only in hashing and personal info validation.

### Current Code

```python
def _normalize_payload(value: Any) -> Any:  # Lines 88-101
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)  # NFC normalization
    # ... handles lists, dicts recursively
```

### Where Normalization is Missing

- `workExperience[].description` lists
- Custom section content
- Education descriptions
- Skills and certifications

### Impact

Users can input different Unicode forms:
- `café` (decomposed) vs `café` (composed)
- Different forms of the same character
- Hashes won't match on round-trips

### Proposed Fix

```python
def normalize_unicode_recursive(value: Any) -> Any:
    """Normalize all strings in a data structure to NFC."""
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    elif isinstance(value, dict):
        return {k: normalize_unicode_recursive(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [normalize_unicode_recursive(item) for item in value]
    return value

# Apply on all incoming data
class ResumeData(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def normalize_unicode(cls, data: dict) -> dict:
        """Normalize all string fields to NFC Unicode."""
        return normalize_unicode_recursive(data)
```

---

## JSON-008: Asymmetric Null Handling in Personal Info

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:191-203`

### Description

Personal info validation has inconsistent null handling that can cause crashes.

### Current Code

```python
def _validate_confirm_payload(...):
    original_info = original_data.get("personalInfo")
    improved_info = improved_data.get("personalInfo")
    if not isinstance(original_info, dict) or not isinstance(improved_info, dict):
        raise ValueError("personalInfo payload is missing or invalid")
    fields = set(original_info.keys()) | set(improved_info.keys())
```

### Impact

- Line 191: `original_info = original_data.get("personalInfo")` returns None if missing
- Line 193: Checks `isinstance(..., dict)` - good
- Problem: If either is None, validation silently skips (returns early at line 189)
- Line 195: `fields = set(...).keys()` - if original_info is None after check, this crashes

### Proposed Fix

```python
def _validate_confirm_payload(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> None:
    """Validate confirm payload with explicit null checks."""
    if original_data is None:
        logger.warning("Original data is None, skipping validation")
        return

    original_info = original_data.get("personalInfo")
    improved_info = improved_data.get("personalInfo")

    # Explicit type checking with clear error messages
    if original_info is None:
        raise ValueError("Original resume missing personalInfo")
    if improved_info is None:
        raise ValueError("Improved resume missing personalInfo")
    if not isinstance(original_info, dict):
        raise ValueError(f"Original personalInfo is not a dict: {type(original_info)}")
    if not isinstance(improved_info, dict):
        raise ValueError(f"Improved personalInfo is not a dict: {type(improved_info)}")

    # Now safe to use
    fields = set(original_info.keys()) | set(improved_info.keys())
    # ... rest of validation
```

---

## JSON-009: Optional Fields Allow Incomplete Data

**Severity:** MEDIUM
**Location:** `apps/backend/app/schemas/models.py`

### Description

Many optional fields with None defaults can lead to incomplete resume data being accepted.

### Current Code

```python
class ImproveResumeData(BaseModel):
    resume_id: str | None = Field(...)  # Can be null for preview
    markdownOriginal: str | None = None  # Can be null
    markdownImproved: str | None = None  # Can be null
    diff_summary: ResumeDiffSummary | None = None
    detailed_changes: list[ResumeFieldDiff] | None = None
```

### Impact

- Frontend can receive completely null auxiliary data
- Code gracefully handles this but user can't debug why diffs are null
- No logging distinguishes "diff calculation failed" vs "original data missing"

### Proposed Fix

```python
class ImproveResumeData(BaseModel):
    resume_id: str | None = Field(None, description="Resume ID, null for preview")
    markdownOriginal: str | None = None
    markdownImproved: str | None = None
    diff_summary: ResumeDiffSummary | None = None
    detailed_changes: list[ResumeFieldDiff] | None = None

    # Add status fields to explain null values
    diff_status: Literal["success", "skipped", "failed"] = "skipped"
    diff_skip_reason: str | None = None

    @model_validator(mode="after")
    def validate_diff_status(self) -> "ImproveResumeData":
        """Ensure diff_skip_reason is set when diff is skipped/failed."""
        if self.diff_status != "success" and self.diff_skip_reason is None:
            self.diff_skip_reason = "Unknown reason"
        return self
```

---

## JSON-010: Deep Nesting in JSON Extraction

**Severity:** MEDIUM
**Location:** `apps/backend/app/llm.py:422-486`

### Description

The `_extract_json()` function has complex bracket-matching logic with recursive calls.

### Current Code

```python
def _extract_json(content: str) -> str:
    # ... 60+ lines of bracket matching, string detection, recursion
    if start_idx > 0:
        return _extract_json(content[start_idx:])  # Recursive call
```

### Impact

1. **Stack overflow:** Deeply nested LLM responses can exceed recursion limit
2. **Incomplete extraction:** Malformed JSON might appear valid after extraction but fail parsing
3. **No size limits:** Response could be MB of JSON before being parsed

### Failure Case Example

```
LLM returns: `...prefix... {"partial": "json` (truncated due to token limit)
_extract_json extracts: `{"partial": "json`
json.loads() fails: JSONDecodeError
Retry happens with same bad data
```

### Proposed Fix

```python
MAX_RECURSION_DEPTH = 10
MAX_JSON_SIZE = 1024 * 1024  # 1MB

def _extract_json(content: str, depth: int = 0) -> str:
    """Extract JSON from content with safety limits."""
    if depth > MAX_RECURSION_DEPTH:
        raise ValueError(f"JSON extraction exceeded max recursion depth: {depth}")

    if len(content) > MAX_JSON_SIZE:
        raise ValueError(f"Content too large for JSON extraction: {len(content)} bytes")

    # ... existing logic ...

    if start_idx > 0:
        return _extract_json(content[start_idx:], depth + 1)  # Pass depth
```

---

## JSON-011: Hash Mismatch Susceptibility

**Severity:** MEDIUM
**Location:** `apps/backend/app/routers/resumes.py:514-532`

### Description

Hash calculation for preview validation can fail due to subtle differences.

### Current Code

```python
preview_hash = _hash_improved_data(improved_data)
# ... stored in DB ...

# Later in confirm:
request_hash = _hash_improved_data(improved_data)
if request_hash not in allowed_hashes:
    raise HTTPException(...)
```

### Impact

Hash collisions or mismatch if:
1. User's client has different Unicode normalization
2. JSON key ordering differs between client/server
3. Floating point representation changes

### Current Mitigations

`ensure_ascii=False` + `sort_keys=True` + NFC normalization helps, but isn't bulletproof.

### Proposed Fix

```python
def _hash_improved_data(data: dict[str, Any]) -> str:
    """Create deterministic hash of improved data."""
    # Normalize deeply
    normalized = _normalize_payload(data)

    # Convert to canonical JSON
    canonical = json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,  # Use ASCII for maximum compatibility
        default=str,  # Handle any non-serializable types
    )

    # Use SHA-256 for collision resistance
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
```

---

## JSON-012: String Forward Reference Inconsistency

**Severity:** LOW
**Location:** `apps/backend/app/schemas/models.py:362`

### Description

Uses string forward reference for a class defined in the same file.

### Current Code

```python
refinement_stats: "RefinementStats | None" = None  # String quote
```

### Impact

- Is unnecessary (class is defined before use)
- Creates inconsistency (line 358-360 use direct references)
- May cause issues with JSON schema generation tools

### Proposed Fix

```python
# Remove string quotes - class is defined earlier in file
refinement_stats: RefinementStats | None = None

# Or if forward reference is needed, use TYPE_CHECKING:
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.schemas.refinement import RefinementStats

class ImproveResumeData(BaseModel):
    refinement_stats: "RefinementStats | None" = None
```
