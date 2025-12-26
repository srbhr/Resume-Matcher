# Code Review & Technical Debt TODO

> **Review Date:** December 2024
> **Last Updated:** December 27, 2024
> **Reviewer:** Deep code analysis focusing on data flow, extensibility, and production readiness
> **Scope:** Full-stack (Frontend + Backend)
> **Status:** Critical & High Priority Issues FIXED. Major features added: WYSIWYG Preview, Status Caching, Centralized API Client.

---

## Executive Summary

The Resume Matcher application is **functionally complete** with major architectural improvements. The codebase demonstrates good separation of concerns with new centralized API client, status caching layer, and WYSIWYG preview system.

### Recent Major Additions (December 27, 2024)

**Status Caching System:**
- Cached system status to avoid LLM health check on every Settings page visit
- Initial load on app start, auto-refresh every 30 minutes
- Optimistic counter updates (incrementResumes, decrementResumes, incrementJobs, etc.)
- `StatusCacheProvider` context wraps entire app
- Last fetched time indicator in Settings UI

**Centralized API Client:**
- Single source of truth for API_URL and API_BASE (`lib/api/client.ts`)
- Helper functions: `apiFetch`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete`, `getUploadUrl`
- Barrel export in `lib/api/index.ts` for clean imports
- Removed duplicate API_URL definitions across 4 files

**WYSIWYG Paginated Preview System (December 26):**
- True page-accurate preview matching PDF output exactly
- Real-time margin visualization and page break detection
- Zoom controls (40%-150%) and margin guide toggle
- Smart pagination: sections span pages, individual items stay together
- New components: `PaginatedPreview`, `PageContainer`, `usePagination` hook
- Page dimensions moved to HTML (margins via padding, not Playwright)
- Backend PDF renderer updated to use zero margins for WYSIWYG accuracy

### Health Score by Category

| Category | Frontend | Backend | Priority | Status |
|----------|----------|---------|----------|--------|
| Data Flow | B+ | B+ | High | **Improved** |
| Type Safety | C+ | B- | High | Pending |
| Error Handling | B | B+ | Critical | **FIXED** |
| Performance | B | C- | Medium | **Improved** |
| Extensibility | A- | B | Medium | **Improved** |
| Security | B | B | High | **FIXED** |
| LLM Reliability | - | A- | Critical | **FIXED** |
| Preview System | A | A | High | **COMPLETE** |
| API Architecture | A | - | Medium | **NEW** |

---

## CRITICAL ISSUES (Must Fix Before Production)

### 1. ~~Silent Failure on Resume Parsing~~ ✅ FIXED
**Files:**
- `apps/backend/app/routers/resumes.py:75-77`
- `apps/backend/app/routers/resumes.py:127-128`

**Problem:** Bare `except pass` silently swallows all errors
```python
try:
    processed_data = await parse_resume_to_json(markdown_content)
except Exception:
    pass  # User never knows parsing failed
```

**Impact:** Users upload resumes thinking they're processed, but structured data is missing

**Fix:**
```python
try:
    processed_data = await parse_resume_to_json(markdown_content)
except Exception as e:
    logger.warning(f"Resume parsing failed for {file.filename}: {e}")
    # Continue with raw markdown, but log for monitoring
```

---

### 2. ~~Context Data Loss on Browser Refresh~~ ✅ FIXED
**File:** `apps/frontend/components/builder/resume-builder.tsx:42-68`

**Problem:** After tailoring, improved resume data is stored only in React Context. Browser refresh = data lost.

**Impact:** Users lose their tailored resume if they accidentally refresh

**Fix Options:**
1. Store improved data in localStorage with resume_id key
2. Redirect to `/resumes/{id}` immediately after improvement (data persisted to DB)
3. Add "unsaved changes" warning before navigation

---

### 3. ~~No Error Boundaries in React~~ ✅ FIXED
**Files:** All frontend pages

**Problem:** No React Error Boundaries implemented. Any component error crashes entire app.

**Fix:**
```typescript
// Create apps/frontend/components/common/error-boundary.tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <ErrorFallback />;
    return this.props.children;
  }
}
```

---

### 4. ~~Hardcoded CORS Origins (Security)~~ ✅ FIXED
**File:** `apps/backend/app/main.py:34-37`

**Problem:** Only localhost allowed, production deployment will fail
```python
allow_origins=[
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
```

**Fix:**
```python
# In config.py
cors_origins: list[str] = Field(default=["http://localhost:3000"])

# In main.py
allow_origins=settings.cors_origins
```

---

### 5. ~~No LLM Call Timeouts~~ ✅ FIXED
**File:** `apps/backend/app/llm.py:90, 131, 163`

**Problem:** LLM calls can hang indefinitely

**Fix:**
```python
response = await litellm.acompletion(
    model=model_name,
    messages=messages,
    timeout=60,  # Add timeout
    # ...
)
```

---

### 6. ~~Fragile JSON Parsing~~ ✅ FIXED (commit a5d7661)
**File:** `apps/backend/app/llm.py`

**Problem:** LLM would sometimes return malformed JSON, echo prompt instructions, or wrap JSON in markdown blocks, causing parsing failures.

**Fix (comprehensive):**
1. **JSON Mode**: Added `_supports_json_mode()` to auto-enable `response_format={"type": "json_object"}` for supported providers (OpenAI, Anthropic, Gemini, DeepSeek, major OpenRouter models)
2. **Retry Logic**: `complete_json()` now retries up to 2 times with progressively lower temperature (0.1 → 0.0)
3. **Robust Extraction**: New `_extract_json()` with bracket-matching algorithm handles:
   - Markdown code blocks (```json ... ```)
   - Trailing text after JSON
   - Malformed responses with extra content
4. **Simplified Prompts**: Removed confusing `{{` escaping in `templates.py`, using cleaner single-brace `{variable}` substitution

```python
def _extract_json(content: str) -> str:
    """Extract JSON with bracket matching, handles malformed responses."""
    # Removes markdown blocks, finds matching braces
    # Falls back to wrapping braceless JSON properties
```

---

## HIGH PRIORITY (Fix Soon)

### 7. ~~Fake Improvement Scores~~ ✅ REMOVED
**File:** `apps/backend/app/routers/resumes.py`

**Resolution:** Scoring feature completely removed from v1 release. Resume improvement now focuses on keyword alignment without numeric scores.

---

### 8. ~~Fake Line Numbers in Suggestions~~ ✅ FIXED
**File:** `apps/backend/app/services/improver.py:119`

**Problem:** Line numbers are fake approximations
```python
"lineNumber": i * 5,  # NOT REAL LINE NUMBERS
```

**Fix:** Either:
1. Remove line numbers entirely (set to `null`)
2. Implement actual diff comparison between original/improved

---

### 9. ~~UI Inconsistencies~~ ✅ FIXED (commit a5d7661)
**Files:**
- `apps/frontend/app/(default)/resumes/[id]/page.tsx`
- `apps/frontend/components/builder/resume-builder.tsx`
- `apps/frontend/components/dashboard/resume-component.tsx`

**Problems:**
1. Missing back button in Resume Builder
2. Resume too narrow (210mm A4 width caused excessive whitespace)
3. Inconsistent shadow styles (blur shadows vs Swiss-style hard shadows)
4. Shadow clipping at bottom of resume containers
5. Resume viewer not scrollable

**Fixes:**
- Added "Back to Dashboard" button to Resume Builder header
- Increased resume width from 210mm to 250mm (~20% wider)
- Applied consistent Swiss-style shadows: `shadow-[8px_8px_0px_0px_#000000]`
- Added bottom padding (`pb-4`) to prevent shadow clipping
- Added `overflow-y-auto` to scrollable containers
- Removed internal shadow from Resume component (parent provides shadow)

---

### 10. Type Unsafe JSON Parsing (Frontend)
**File:** `apps/frontend/app/(default)/resumes/[id]/page.tsx:34-36`

**Problem:** `JSON.parse()` can throw, parsed data not validated
```typescript
const parsed = JSON.parse(data.raw_resume.content);
setResumeData(parsed as ResumeData);  // Unsafe cast
```

**Fix:**
```typescript
try {
    const parsed = JSON.parse(data.raw_resume.content);
    // Validate with zod or similar
    const validated = ResumeDataSchema.parse(parsed);
    setResumeData(validated);
} catch (e) {
    setError('Invalid resume data format');
}
```

---

### 11. Excessive `any` Types
**Files:**
- `apps/frontend/components/builder/forms/experience-form.tsx:34`
- `apps/frontend/components/builder/forms/education-form.tsx:33`
- `apps/frontend/components/builder/forms/projects-form.tsx:33`
- `apps/backend/app/database.py` (23 instances of `dict[str, Any]`)

**Problem:** Defeats TypeScript/mypy protection

**Fix:** Define specific types for all data structures

---

### 12. No API Response Validation
**File:** `apps/frontend/lib/api/resume.ts:43-44`

**Problem:** Assumes response structure without validation
```typescript
return data.job_id[0];  // What if job_id is undefined or empty?
```

**Fix:**
```typescript
if (!data.job_id || !Array.isArray(data.job_id) || data.job_id.length === 0) {
    throw new Error('Invalid job upload response');
}
return data.job_id[0];
```

---

## MEDIUM PRIORITY (Address for Scale)

### 13. O(n) Database Operations
**File:** `apps/backend/app/database.py:169-176`

**Problem:** Status endpoint scans entire database 4 times
```python
def get_stats(self) -> dict[str, Any]:
    return {
        "total_resumes": len(self.resumes),        # O(n)
        "total_jobs": len(self.jobs),              # O(n)
        "total_improvements": len(self.improvements),  # O(n)
        "has_master_resume": self.get_master_resume() is not None,  # O(n)
    }
```

**Fix:** Cache counts, update on writes:
```python
def __init__(self):
    self._stats_cache = None
    self._stats_dirty = True

def get_stats(self):
    if self._stats_dirty:
        self._stats_cache = self._compute_stats()
        self._stats_dirty = False
    return self._stats_cache
```

---

### 14. ~~Console.log in Production Code~~ ✅ FIXED
**Files:**
- ~~`apps/frontend/lib/api/resume.ts:86, 118`~~

**Resolution:** Removed debug `console.log` statements from `uploadJobDescriptions` and `improveResume` functions. Console.error statements retained for error debugging.

---

### 15. Duplicate Form Array Logic
**Files:**
- `apps/frontend/components/builder/forms/experience-form.tsx`
- `apps/frontend/components/builder/forms/projects-form.tsx`

**Problem:** ~250 lines of identical array management code

**Fix:** Create `useArrayFieldManager` hook:
```typescript
function useArrayFieldManager<T extends { id: number }>(
    data: T[],
    onChange: (items: T[]) => void,
    createEmpty: () => Omit<T, 'id'>
) {
    const add = useCallback(() => {
        const newId = Math.max(...data.map(d => d.id), 0) + 1;
        onChange([...data, { ...createEmpty(), id: newId } as T]);
    }, [data, onChange, createEmpty]);
    // ... remove, update methods
    return { add, remove, update };
}
```

---

### 16. Missing Memoization
**Files:**
- `apps/frontend/components/dashboard/resume-component.tsx` (main renderer)
- `apps/frontend/components/builder/resume-form.tsx:17-57` (8 handlers)

**Problem:** Every keystroke re-renders entire preview

**Fix:**
```typescript
// Memoize Resume component
const Resume = React.memo(({ resumeData }: ResumeProps) => {
    // ...
});

// Memoize handlers
const handlePersonalInfoChange = useCallback((newInfo: PersonalInfo) => {
    onUpdate(prev => ({ ...prev, personalInfo: newInfo }));
}, [onUpdate]);
```

---

### 17. ~~Duplicate API URL Construction~~ ✅ FIXED
**Files:**
- ~~`apps/frontend/lib/api/resume.ts:3`~~
- ~~`apps/frontend/lib/api/config.ts:1`~~
- ~~`apps/frontend/components/dashboard/resume-upload-dialog.tsx:36-38`~~
- ~~`apps/frontend/app/print/resumes/[id]/page.tsx:10`~~

**Resolution:** Created centralized API client (`lib/api/client.ts`) with:
- `API_URL` and `API_BASE` as single source of truth
- Helper functions: `apiFetch`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete`
- `getUploadUrl()` for file upload endpoint
- Barrel export in `lib/api/index.ts` for clean imports
- All 4 files updated to import from centralized client

---

### 18. Race Condition in Master Resume
**File:** `apps/backend/app/database.py:105-114`

**Problem:** Two non-atomic operations to switch master resume
```python
self.resumes.update({"is_master": False}, Resume.is_master == True)
# <- Another request could run here
self.resumes.update({"is_master": True}, Resume.resume_id == resume_id)
```

**Impact:** Potential for zero or multiple master resumes

**Fix:** Need atomic operation or locking mechanism

---

### 19. No Input Length Validation
**Files:**
- `apps/backend/app/routers/jobs.py` (job description)
- `apps/backend/app/routers/resumes.py` (resume content)

**Problem:** Unlimited text can cause OOM or exceed LLM token limits

**Fix:**
```python
MAX_JOB_DESC_LENGTH = 50000  # ~12k tokens
MAX_RESUME_LENGTH = 100000   # ~25k tokens

if len(content) > MAX_JOB_DESC_LENGTH:
    raise HTTPException(400, "Job description too long")
```

---

## LOW PRIORITY (Nice to Have)

### 20. Missing Debounce on Form Inputs
**File:** `apps/frontend/components/builder/resume-builder.tsx`

**Problem:** State updates on every keystroke

**Fix:** Add debounce to form updates

---

### 21. Hardcoded Tailwind Values
**Multiple files:** Shadow utilities repeated
- `shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]`
- `shadow-[4px_4px_0px_0px_#000000]`
- `shadow-[2px_2px_0px_0px_#000000]`

**Fix:** Add to `tailwind.config.js`:
```javascript
extend: {
    boxShadow: {
        'swiss-lg': '8px 8px 0px 0px rgba(0,0,0,0.1)',
        'swiss-md': '4px 4px 0px 0px #000000',
        'swiss-sm': '2px 2px 0px 0px #000000',
    }
}
```

---

### 22. Inconsistent Response Formats
**Files:** Backend routers

**Problem:** Some endpoints return `{ data: {...} }`, others return flat objects

**Fix:** Standardize all responses:
```python
class APIResponse(BaseModel, Generic[T]):
    request_id: str
    data: T
    errors: list[str] = []
```

---

## EXTENSIBILITY IMPROVEMENTS

### For Adding New Resume Sections

**Current State:** Must modify 8+ files, 200-300 lines

**Recommendation:** Create section registry pattern
```typescript
// apps/frontend/lib/resume-sections.ts
export const RESUME_SECTIONS = [
    {
        key: 'personalInfo',
        component: PersonalInfoForm,
        icon: User,
        label: 'Personal Info',
        defaultValue: () => ({ name: '', email: '', ... })
    },
    // Add new sections here
];
```

---

### For Adding New Export Formats

**Current State:** Only JSON export, no architecture

**Recommendation:** Create export provider pattern
```typescript
// apps/frontend/lib/exporters/index.ts
interface ResumeExporter {
    name: string;
    extension: string;
    mimeType: string;
    export(data: ResumeData): Promise<Blob>;
}

export const exporters: ResumeExporter[] = [
    new JSONExporter(),
    new MarkdownExporter(),
    new PDFExporter(),  // Would need backend support
];
```

---

### For Adding Batch Processing

**Current State:** Not supported, would need major changes

**Recommendation:** Future architecture
```
1. Add task queue (Redis + Celery)
2. Create batch endpoint: POST /api/v1/batch/improve
3. Return job_id, poll for status
4. Store results in database with batch_id
```

---

## REFACTORING ROADMAP

### Phase 1: Critical Fixes (1-2 days) ✅ COMPLETE
- [x] Fix silent failures (add logging)
- [x] Add error boundaries
- [x] Move CORS to config
- [x] Add LLM timeouts
- [x] Fix fake scores (removed from v1)

### Phase 2: Type Safety (2-3 days) - IN PROGRESS
- [ ] Replace `any` types
- [ ] Add response validation (skipped - LLM responses unpredictable)
- [ ] Add input validation
- [ ] Create shared types package

### Phase 3: Performance (1-2 days) ✅ MOSTLY COMPLETE
- [ ] Add memoization
- [x] Cache system status (StatusCacheProvider with 30-min refresh)
- [x] Add debouncing (pagination hook uses 150ms debounce)
- [x] Remove console.logs from production code

### Phase 4: DRY Refactoring (2-3 days) - PARTIALLY COMPLETE
- [ ] Create useArrayFieldManager hook
- [x] Centralize API client (lib/api/client.ts + index.ts)
- [ ] Create Tailwind config extensions
- [ ] Standardize response formats

### Phase 5: Extensibility (3-5 days) - PARTIALLY COMPLETE
- [ ] Section registry pattern
- [ ] Export provider pattern
- [x] LLM provider factory (6 providers supported)
- [x] Config-driven providers
- [x] WYSIWYG Preview System (complete architecture)

### Phase 6: WYSIWYG Preview ✅ COMPLETE
- [x] Page dimension constants and utilities
- [x] PageContainer component with margin guides
- [x] usePagination hook with smart page breaks
- [x] PaginatedPreview component with controls
- [x] Backend PDF renderer with zero margins
- [x] CSS page break rules for print

### Phase 7: API & Status Architecture ✅ COMPLETE
- [x] Centralized API client (`lib/api/client.ts`)
- [x] Barrel exports (`lib/api/index.ts`)
- [x] Status caching context (`lib/context/status-cache.tsx`)
- [x] Optimistic counter updates
- [x] 30-minute auto-refresh for LLM health
- [x] Last fetched time indicator in UI

---

## METRICS TO TRACK

After fixes, measure:
1. **Error Rate:** % of requests failing (target: <1%)
2. **P95 Latency:** API response time (target: <2s for non-LLM, <30s for LLM)
3. **Type Coverage:** % of code with explicit types (target: >95%)
4. **Bundle Size:** Frontend JS size (target: <500KB gzipped)

---

## APPENDIX: File Reference

### Frontend Critical Files
| File | Lines | Issues |
|------|-------|--------|
| `components/builder/resume-builder.tsx` | 345 | ~~Context loss~~, no memoization |
| `lib/api/resume.ts` | 93 | ~~console.log~~, any types |
| `app/(default)/resumes/[id]/page.tsx` | 123 | Unsafe JSON parse |
| `components/builder/forms/experience-form.tsx` | 174 | Duplicate logic, any types |

### Frontend New Files (WYSIWYG Preview)
| File | Lines | Purpose |
|------|-------|---------|
| `components/preview/paginated-preview.tsx` | 180 | Main preview with zoom/margin controls |
| `components/preview/page-container.tsx` | 110 | Single page wrapper with margin guides |
| `components/preview/use-pagination.ts` | 180 | Page break calculation hook |
| `lib/constants/page-dimensions.ts` | 65 | A4/Letter dimensions, mm↔px utilities |

### Frontend New Files (API & Status)
| File | Lines | Purpose |
|------|-------|---------|
| `lib/api/client.ts` | 65 | Centralized API client, helper functions |
| `lib/api/index.ts` | 35 | Barrel exports for clean imports |
| `lib/context/status-cache.tsx` | 200 | Status caching with optimistic updates |

### Backend Critical Files
| File | Lines | Issues |
|------|-------|--------|
| `routers/resumes.py` | 355 | ~~Silent failures~~, ~~fake scores~~, generic errors |
| `database.py` | 178 | O(n) operations, race conditions |
| `llm.py` | 184 | ~~No timeouts~~, ~~fragile JSON parsing~~ |
| `services/improver.py` | 141 | Fake line numbers, weak logic |
| `pdf.py` | 73 | WYSIWYG PDF with zero margins |

---

*This document should be updated as issues are resolved. Mark completed items with `[x]` and add resolution date.*
