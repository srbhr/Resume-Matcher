# API Flow Maps

This document provides visual flow diagrams for all API operations in the Resume Matcher application. Each flow shows the complete sequence from HTTP request to response, including all function calls, database operations, and LLM invocations.

---

## Table of Contents

1. [Resume Upload Flow](#1-resume-upload-flow)
2. [Resume Tailoring Flow](#2-resume-tailoring-flow)
3. [Resume Fetch Flow](#3-resume-fetch-flow)
4. [Resume Update Flow](#4-resume-update-flow)
5. [Resume Delete Flow](#5-resume-delete-flow)
6. [Resume List Flow](#6-resume-list-flow)
7. [PDF Generation Flow](#7-pdf-generation-flow)
   - 7.1 [Cover Letter PDF Generation Flow](#71-cover-letter-pdf-generation-flow)
   - 7.2 [On-Demand Content Generation Flow](#72-on-demand-content-generation-flow)
8. [Job Upload Flow](#8-job-upload-flow)
9. [LLM Configuration Flow](#9-llm-configuration-flow)
10. [System Status Flow](#10-system-status-flow)
11. [Complete User Journey Maps](#11-complete-user-journey-maps)

---

## 1. Resume Upload Flow

**Endpoint:** `POST /api/v1/resumes/upload`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RESUME UPLOAD FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  POST /resumes/upload         │                                  │
     │  (multipart/form-data)        │                                  │
     │  file: PDF/DOCX               │                                  │
     │  is_master: boolean           │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/resumes.py  │                       │
     │                    │ upload_resume()     │                       │
     │                    │ Lines: 30-80        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Generate resume_id  │                       │
     │                    │ uuid4()             │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Save file to disk   │                       │
     │                    │ data/uploads/{id}/  │                       │
     │                    │ original.{ext}      │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ save_resume()       │                       │
     │                    │ status: "pending"   │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Write to TinyDB]               │
     │                               │  data/db.json                    │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ BackgroundTasks     │                       │
     │                    │ process_resume()    │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │  {"resume_id": "...",         │                                  │
     │   "status": "pending"}        │                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
     │          [BACKGROUND TASK STARTS]                                │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ services/parser.py  │                       │
     │                    │ parse_document()    │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Read file bytes]               │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ PyMuPDF / docx2txt  │                       │
     │                    │ Extract raw text    │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ services/parser.py  │                       │
     │                    │ parse_resume_to_json│                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ llm.py              │                       │
     │                    │ complete_json()     │                       │
     │                    │ PARSE_RESUME_PROMPT │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [LLM API Call]                  │
     │                               │  LiteLLM → Provider              │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  [Structured JSON Response]      │
     │                               │<─────────────────────────────────│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Validate with       │                       │
     │                    │ ResumeData schema   │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ update_resume()     │                       │
     │                    │ status: "ready"     │                       │
     │                    │ resume_data: {...}  │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Update TinyDB]                 │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │          [BACKGROUND TASK COMPLETE]                              │
     │                               │                                  │
```

### Key Functions Called

| Step | File | Function | Purpose |
|------|------|----------|---------|
| 1 | `routers/resumes.py:30` | `upload_resume()` | Entry point, handles multipart |
| 2 | `routers/resumes.py:45` | `uuid.uuid4()` | Generate unique ID |
| 3 | `routers/resumes.py:52` | File write | Save original document |
| 4 | `database.py:45` | `save_resume()` | Initial DB record |
| 5 | `routers/resumes.py:70` | `process_resume()` | Background task |
| 6 | `services/parser.py:15` | `parse_document()` | Extract text |
| 7 | `services/parser.py:45` | `parse_resume_to_json()` | LLM parsing |
| 8 | `llm.py:85` | `complete_json()` | LLM API call |
| 9 | `database.py:65` | `update_resume()` | Final status update |

### Database Changes

```json
// Initial insert (step 4)
{
  "resume_id": "uuid-here",
  "is_master": true,
  "status": "pending",
  "file_path": "data/uploads/{id}/original.pdf",
  "created_at": "2024-01-01T00:00:00Z"
}

// After processing (step 9)
{
  "resume_id": "uuid-here",
  "is_master": true,
  "status": "ready",
  "file_path": "data/uploads/{id}/original.pdf",
  "resume_data": { /* ResumeData JSON */ },
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:05Z"
}
```

---

## 2. Resume Tailoring Flow

**Endpoint:** `POST /api/v1/resumes/improve`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESUME TAILORING FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  POST /resumes/improve        │                                  │
     │  {resume_id, job_id}          │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/resumes.py  │                       │
     │                    │ improve_resume()    │                       │
     │                    │ Lines: 120-180      │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ get_resume()        │                       │
     │                    │ get_job()           │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Read TinyDB]                   │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ services/improver.py│                       │
     │                    │ extract_job_keywords│                       │
     │                    │ Lines: 25-60        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ llm.py              │                       │
     │                    │ complete_json()     │                       │
     │                    │ EXTRACT_KEYWORDS    │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [LLM Call #1: Keywords]         │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  {skills:[], requirements:[]}    │
     │                               │<─────────────────────────────────│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ services/improver.py│                       │
     │                    │ improve_resume()    │                       │
     │                    │ Lines: 65-120       │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ llm.py              │                       │
     │                    │ complete_json()     │                       │
     │                    │ IMPROVE_RESUME      │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [LLM Call #2: Improve]          │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  {improved ResumeData}           │
     │                               │<─────────────────────────────────│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Generate new ID     │                       │
     │                    │ for tailored resume │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ save_resume()       │                       │
     │                    │ is_master: false    │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Write TinyDB]                  │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ save_improvement()  │                       │
     │                    │ Links master→child  │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Write TinyDB]                  │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │  {"resume_id": "new-id",      │                                  │
     │   "resume_data": {...},       │                                  │
     │   "job_keywords": {...}}      │                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### LLM Prompts Used

**LLM Call #1: Extract Keywords**
```
File: prompts/templates.py
Constant: EXTRACT_KEYWORDS_PROMPT

Input: Job description text
Output: {
  "skills": ["Python", "FastAPI", ...],
  "requirements": ["5+ years", ...],
  "keywords": ["backend", "API", ...]
}
```

**LLM Call #2: Improve Resume**
```
File: prompts/templates.py
Constant: IMPROVE_RESUME_PROMPT

Input: Original resume JSON + Job keywords
Output: Tailored ResumeData JSON with:
  - Enhanced bullet points
  - Keyword integration
  - Relevant experience highlighted
```

### Database Records Created

```json
// New tailored resume
{
  "resume_id": "new-uuid",
  "is_master": false,
  "status": "ready",
  "resume_data": { /* Improved ResumeData */ },
  "source_resume_id": "master-uuid",
  "job_id": "job-uuid",
  "created_at": "..."
}

// Improvement tracking record
{
  "improvement_id": "imp-uuid",
  "master_resume_id": "master-uuid",
  "tailored_resume_id": "new-uuid",
  "job_id": "job-uuid",
  "created_at": "..."
}
```

---

## 3. Resume Fetch Flow

**Endpoint:** `GET /api/v1/resumes/{resume_id}`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RESUME FETCH FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  GET /resumes/{resume_id}     │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/resumes.py  │                       │
     │                    │ get_resume()        │                       │
     │                    │ Lines: 85-105       │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ get_resume()        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Query TinyDB]                  │
     │                               │  resumes.search(id == resume_id) │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  [Resume document or None]       │
     │                               │<─────────────────────────────────│
     │                               │                                  │
     │              ┌────────────────┴────────────────┐                 │
     │              │                                 │                 │
     │        [Found]                           [Not Found]             │
     │              │                                 │                 │
     │              ▼                                 ▼                 │
     │  {"resume_id": "...",              HTTPException(404)            │
     │   "status": "ready",               "Resume not found"            │
     │   "is_master": true,                          │                  │
     │   "resume_data": {...}}                       │                  │
     │<──────────────────────────────────────────────│                  │
     │                               │                                  │
```

### Response Schema

```typescript
interface ResumeResponse {
  resume_id: string;
  status: "pending" | "processing" | "ready" | "failed";
  is_master: boolean;
  resume_data?: ResumeData;  // Only if status === "ready"
  error?: string;            // Only if status === "failed"
  created_at: string;
  updated_at?: string;
}
```

---

## 4. Resume Update Flow

**Endpoint:** `PATCH /api/v1/resumes/{resume_id}`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RESUME UPDATE FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  PATCH /resumes/{resume_id}   │                                  │
     │  {"resume_data": {...}}       │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/resumes.py  │                       │
     │                    │ update_resume()     │                       │
     │                    │ Lines: 185-220      │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Validate request    │                       │
     │                    │ ResumeData schema   │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ get_resume()        │                       │
     │                    │ (verify exists)     │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Query TinyDB]                  │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ update_resume()     │                       │
     │                    │ Merge resume_data   │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Update TinyDB]                 │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │  {"resume_id": "...",         │                                  │
     │   "status": "ready",          │                                  │
     │   "resume_data": {...}}       │                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### Validation Rules

The `ResumeData` schema validates:
- `personal_info` - Required, must have `name`
- `experience[]` - Optional, each must have `title`, `company`
- `education[]` - Optional, each must have `degree`, `institution`
- `projects[]` - Optional, each must have `name`
- `skills` - Optional, string or array

---

## 5. Resume Delete Flow

**Endpoint:** `DELETE /api/v1/resumes/{resume_id}`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RESUME DELETE FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  DELETE /resumes/{resume_id}  │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/resumes.py  │                       │
     │                    │ delete_resume()     │                       │
     │                    │ Lines: 225-260      │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ get_resume()        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Query TinyDB]                  │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Delete file from    │                       │
     │                    │ data/uploads/{id}/  │                       │
     │                    │ (if exists)         │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Remove directory]              │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ delete_resume()     │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Remove from TinyDB]            │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │  {"message": "Deleted"}       │                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### Cascading Effects

When a **master resume** is deleted:
- The resume record is removed from `resumes` table
- The uploaded file is deleted from disk
- **Note:** Tailored resumes derived from it remain (orphaned)

When a **tailored resume** is deleted:
- Only the tailored resume record is removed
- The improvement tracking record remains (for analytics)

---

## 6. Resume List Flow

**Endpoint:** `GET /api/v1/resumes/list`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RESUME LIST FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  GET /resumes/list            │                                  │
     │  ?include_master=false        │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/resumes.py  │                       │
     │                    │ list_resumes()      │                       │
     │                    │ Lines: 108-118      │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ list_resumes()      │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Query TinyDB]                  │
     │                               │  resumes.all()                   │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Filter by           │                       │
     │                    │ include_master flag │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │  {"resumes": [                │                                  │
     │    {"resume_id": "...", ...}, │                                  │
     │    ...                        │                                  │
     │  ]}                           │                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `include_master` | boolean | `true` | Include master resume in results |

---

## 7. PDF Generation Flow

**Endpoint:** `GET /api/v1/resumes/{resume_id}/pdf`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PDF GENERATION FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  GET /resumes/{id}/pdf        │                                  │
     │  ?template=swiss-single       │                                  │
     │  &pageSize=A4                 │                                  │
     │  &marginTop=15                │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/resumes.py  │                       │
     │                    │ get_resume_pdf()    │                       │
     │                    │ Lines: 265-310      │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ get_resume()        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Query TinyDB]                  │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Build print URL     │                       │
     │                    │ FRONTEND_URL/print/ │                       │
     │                    │ resumes/{id}?params │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ pdf.py              │                       │
     │                    │ render_resume_pdf() │                       │
     │                    │ Lines: 15-80        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Playwright          │                       │
     │                    │ Launch Chromium     │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [HTTP GET to Frontend]          │
     │                               │  /print/resumes/{id}?params      │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  [Rendered HTML page]            │
     │                               │<─────────────────────────────────│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ page.pdf()          │                       │
     │                    │ format: A4/Letter   │                       │
     │                    │ margins: from params│                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │  [PDF binary stream]          │                                  │
     │  Content-Type: application/pdf│                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### Query Parameters for PDF

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `template` | string | `swiss-single` | Template name |
| `pageSize` | string | `A4` | `A4` or `LETTER` |
| `marginTop` | number | `15` | Top margin in mm |
| `marginBottom` | number | `15` | Bottom margin in mm |
| `marginLeft` | number | `15` | Left margin in mm |
| `marginRight` | number | `15` | Right margin in mm |
| `sectionSpacing` | number | `3` | Section gap level (1-5) |
| `itemSpacing` | number | `3` | Item gap level (1-5) |
| `lineHeight` | number | `3` | Line height level (1-5) |
| `fontSize` | number | `3` | Base font size level (1-5) |
| `headerScale` | number | `3` | Header scale level (1-5) |

### Playwright Configuration

```python
# pdf.py
pdf_options = {
    "format": page_size,  # "A4" or "Letter"
    "margin": {
        "top": "0mm",     # Margins applied in HTML
        "right": "0mm",
        "bottom": "0mm",
        "left": "0mm",
    },
    "print_background": True,
    "prefer_css_page_size": False,
}
```

---

## 7.1 Cover Letter PDF Generation Flow

**Endpoint:** `GET /api/v1/resumes/{resume_id}/cover-letter/pdf`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COVER LETTER PDF GENERATION FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  GET /resumes/{id}/           │                                  │
     │  cover-letter/pdf             │                                  │
     │  ?pageSize=A4                 │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/resumes.py  │                       │
     │                    │ download_cover_     │                       │
     │                    │ letter_pdf()        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ get_resume()        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Query TinyDB]                  │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Check cover_letter  │                       │
     │                    │ field exists        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Build print URL     │                       │
     │                    │ FRONTEND_URL/print/ │                       │
     │                    │ cover-letter/{id}   │                       │
     │                    │ ?pageSize=...       │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ pdf.py              │                       │
     │                    │ render_resume_pdf() │                       │
     │                    │ selector=".cover-   │                       │
     │                    │ letter-print"       │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Playwright          │                       │
     │                    │ Launch Chromium     │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [HTTP GET to Frontend]          │
     │                               │  /print/cover-letter/{id}        │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  [Frontend fetches resume data]  │
     │                               │  GET /resumes?resume_id={id}     │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  [Rendered HTML page with        │
     │                               │   .cover-letter-print class]     │
     │                               │<─────────────────────────────────│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ page.pdf()          │                       │
     │                    │ wait for selector:  │                       │
     │                    │ ".cover-letter-     │                       │
     │                    │ print"              │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │  [PDF binary stream]          │                                  │
     │  Content-Type: application/pdf│                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### Cover Letter Update Endpoints

| Method | Endpoint | Handler | Description |
|--------|----------|---------|-------------|
| PATCH | `/resumes/{id}/cover-letter` | `update_cover_letter()` | Update cover letter text |
| PATCH | `/resumes/{id}/outreach-message` | `update_outreach_message()` | Update outreach message |

### Critical: CSS Visibility Rules

**IMPORTANT:** The print CSS in `globals.css` hides all content by default and only shows elements matching specific selectors. For cover letter PDFs to work, `.cover-letter-print` must be whitelisted:

```css
@media print {
  body * { visibility: hidden !important; }

  .resume-print,
  .resume-print *,
  .cover-letter-print,
  .cover-letter-print * {
    visibility: visible !important;
  }
}
```

**If this CSS rule is missing, Playwright will generate blank PDFs.**

---

## 7.2 On-Demand Content Generation Flow

**Endpoints:**
- `POST /api/v1/resumes/{resume_id}/generate-cover-letter`
- `POST /api/v1/resumes/{resume_id}/generate-outreach`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  ON-DEMAND CONTENT GENERATION FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  POST /resumes/{id}/          │                                  │
     │  generate-cover-letter        │                                  │
     │  (or generate-outreach)       │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/resumes.py  │                       │
     │                    │ generate_cover_     │                       │
     │                    │ letter_endpoint()   │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ get_resume()        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Query TinyDB]                  │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Check parent_id     │                       │
     │                    │ (must be tailored)  │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ get_improvement_by_ │                       │
     │                    │ tailored_resume()   │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Query improvements table]      │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ get_job()           │                       │
     │                    │ (from improvement)  │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Query jobs table]              │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ services/           │                       │
     │                    │ cover_letter.py     │                       │
     │                    │ generate_cover_     │                       │
     │                    │ letter() or         │                       │
     │                    │ generate_outreach_  │                       │
     │                    │ message()           │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [LLM API Call]                  │
     │                               │  LiteLLM → Provider              │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  [Generated content]             │
     │                               │<─────────────────────────────────│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ update_resume()     │                       │
     │                    │ cover_letter: "..." │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Update TinyDB]                 │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │  {"content": "...",           │                                  │
     │   "message": "...generated    │                                  │
     │   successfully"}              │                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### Key Differences from Auto-Generation

| Aspect | Auto-Generation (Tailor Flow) | On-Demand Generation |
|--------|-------------------------------|----------------------|
| Trigger | During `/resumes/improve` | User clicks "Generate" button |
| Settings Toggle | Requires `enable_cover_letter` flag | No toggle required |
| Job Context | From request payload | Retrieved from improvements table |
| Use Case | Automatic generation during tailoring | Generate later, regenerate with updates |

### Frontend UX Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     RESUME BUILDER - ON-DEMAND GENERATION                    │
└─────────────────────────────────────────────────────────────────────────────┘

User opens tailored resume in Builder
         │
         ▼
┌─────────────────┐
│ Tabs: RESUME |  │
│ COVER LETTER |  │
│ OUTREACH        │
└────────┬────────┘
         │
User clicks "COVER LETTER" tab (empty)
         │
         ▼
┌─────────────────────────────────────┐
│        GeneratePrompt Component      │
│                                      │
│  ┌─────────────────────────────┐    │
│  │     📄 Cover Letter         │    │
│  │                             │    │
│  │  Create a tailored cover    │    │
│  │  letter based on your       │    │
│  │  resume and job description │    │
│  │                             │    │
│  │   [✨ Generate Cover Letter] │    │
│  └─────────────────────────────┘    │
└────────────────┬────────────────────┘
                 │
User clicks "Generate"
                 │
                 ▼
┌─────────────────┐     ┌─────────────────┐
│ POST /resumes/  │────>│ LLM generates   │
│ {id}/generate-  │     │ cover letter    │
│ cover-letter    │     └─────────────────┘
└────────┬────────┘
         │
         │ (content returned)
         ▼
┌─────────────────────────────────────┐
│     CoverLetterEditor Component     │
│                                      │
│  [Regenerate] [Download]            │
│  ┌─────────────────────────────┐    │
│  │ Dear Hiring Manager,        │    │
│  │                             │    │
│  │ I am excited to apply...    │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                      │
│  Words: 156 | Characters: 892       │
│  [Save Changes]                     │
└─────────────────────────────────────┘
```

### Regeneration Flow (with Confirmation)

```
User clicks "Regenerate" (content exists)
         │
         ▼
┌─────────────────────────────────────┐
│         ConfirmDialog               │
│                                      │
│  ⚠️ Regenerate Cover Letter?        │
│                                      │
│  This will replace your current     │
│  cover letter with a newly          │
│  generated one. Any edits you've    │
│  made will be lost.                 │
│                                      │
│        [Cancel]  [Regenerate]       │
└────────────────┬────────────────────┘
                 │
User confirms
                 │
                 ▼
         New LLM generation
         Content replaced
```

---

## 8. Job Upload Flow

**Endpoint:** `POST /api/v1/jobs/upload`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           JOB UPLOAD FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  POST /jobs/upload            │                                  │
     │  {"descriptions": ["..."]}    │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/jobs.py     │                       │
     │                    │ upload_jobs()       │                       │
     │                    │ Lines: 15-50        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ For each description│                       │
     │                    │ Generate job_id     │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ save_job()          │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Write TinyDB]                  │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │  {"job_ids": ["..."]}         │                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### Job Record Structure

```json
{
  "job_id": "uuid",
  "description": "Full job description text...",
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

## 9. LLM Configuration Flow

**Endpoint:** `PUT /api/v1/config/llm`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LLM CONFIGURATION FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  PUT /config/llm              │                                  │
     │  {provider, model, api_key}   │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/config.py   │                       │
     │                    │ update_llm_config() │                       │
     │                    │ Lines: 45-85        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ config.py           │                       │
     │                    │ Settings.update()   │                       │
     │                    │ Validates provider  │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ Write to .env or    │                       │
     │                    │ Update singleton    │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ llm.py              │                       │
     │                    │ check_llm_health()  │                       │
     │                    │ Verify new config   │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Test LLM API Call]             │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  [Success/Failure]               │
     │                               │<─────────────────────────────────│
     │                               │                                  │
     │  {"status": "configured",     │                                  │
     │   "provider": "openai",       │                                  │
     │   "model": "gpt-4o-mini"}     │                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### Supported Providers

| Provider | Model Prefix | API Key Required |
|----------|--------------|------------------|
| `openai` | None | Yes |
| `anthropic` | None | Yes |
| `openrouter` | `openrouter/` | Yes |
| `gemini` | `gemini/` | Yes |
| `deepseek` | `deepseek/` | Yes |
| `ollama` | `ollama/` | No (local) |

---

## 10. System Status Flow

**Endpoint:** `GET /api/v1/health/status`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYSTEM STATUS FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                           External
─────────────────────────────────────────────────────────────────────────────
     │                               │                                  │
     │  GET /health/status           │                                  │
     │──────────────────────────────>│                                  │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ routers/health.py   │                       │
     │                    │ get_status()        │                       │
     │                    │ Lines: 25-70        │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ database.py         │                       │
     │                    │ count_resumes()     │                       │
     │                    │ count_jobs()        │                       │
     │                    │ count_improvements()│                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [Count queries to TinyDB]       │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                    ┌──────────┴──────────┐                       │
     │                    │ llm.py              │                       │
     │                    │ check_llm_health()  │                       │
     │                    └──────────┬──────────┘                       │
     │                               │                                  │
     │                               │  [LLM API Health Check]          │
     │                               │  (Small test completion)         │
     │                               │─────────────────────────────────>│
     │                               │                                  │
     │                               │  [Success/Timeout/Error]         │
     │                               │<─────────────────────────────────│
     │                               │                                  │
     │  {"llm_healthy": true,        │                                  │
     │   "database_connected": true, │                                  │
     │   "resumes_count": 5,         │                                  │
     │   "jobs_count": 3,            │                                  │
     │   "improvements_count": 2}    │                                  │
     │<──────────────────────────────│                                  │
     │                               │                                  │
```

### Frontend Caching

The frontend caches this response to avoid repeated LLM health checks:

```typescript
// lib/context/status-cache.tsx
const STATUS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Only fetches if:
// 1. No cached data exists
// 2. Cache is older than 30 minutes
// 3. User manually clicks "Refresh"
```

---

## 11. Complete User Journey Maps

### Journey 1: First-Time User Setup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FIRST-TIME USER SETUP JOURNEY                            │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: User visits Dashboard
         │
         ▼
┌─────────────────┐
│ Check localStorage │
│ master_resume_id   │
└────────┬────────┘
         │ (empty)
         ▼
┌─────────────────┐
│ Show "Initialize │
│ Master Resume"   │
│ card             │
└────────┬────────┘
         │
Step 2: User clicks card
         │
         ▼
┌─────────────────┐
│ ResumeUploadDialog │
│ opens              │
└────────┬────────┘
         │
Step 3: User selects PDF/DOCX
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ POST /resumes/  │────>│ Background:     │
│ upload          │     │ Parse + LLM     │
│ is_master: true │     │ extraction      │
└────────┬────────┘     └─────────────────┘
         │
         │ (resume_id returned)
         ▼
┌─────────────────┐
│ Save to         │
│ localStorage    │
│ master_resume_id│
└────────┬────────┘
         │
Step 4: Dashboard updates
         │
         ▼
┌─────────────────┐
│ Show Master     │
│ Resume card     │
│ (processing)    │
└────────┬────────┘
         │
         │ (polling until "ready")
         ▼
┌─────────────────┐
│ Master Resume   │
│ card clickable  │
│ + "Create Resume"│
│ enabled         │
└─────────────────┘
```

### Journey 2: Resume Tailoring

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RESUME TAILORING JOURNEY                               │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: User clicks "Create Resume" on Dashboard
         │
         ▼
┌─────────────────┐
│ Navigate to     │
│ /tailor         │
└────────┬────────┘
         │
Step 2: User pastes Job Description
         │
         ▼
┌─────────────────┐
│ JD textarea     │
│ (min 50 chars)  │
└────────┬────────┘
         │
Step 3: User clicks "Tailor Resume"
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ POST /jobs/     │────>│ Save JD to DB   │
│ upload          │     │ Returns job_id  │
└────────┬────────┘     └─────────────────┘
         │
         │ (job_id)
         ▼
┌─────────────────┐     ┌─────────────────┐
│ POST /resumes/  │────>│ LLM #1: Extract │
│ improve         │     │ keywords        │
│ {resume_id,     │     ├─────────────────┤
│  job_id}        │     │ LLM #2: Improve │
└────────┬────────┘     │ resume          │
         │              └─────────────────┘
         │
         │ (new_resume_id, resume_data)
         ▼
┌─────────────────┐
│ Navigate to     │
│ /resumes/{id}   │
│ (Viewer)        │
└────────┬────────┘
         │
Step 4: User reviews tailored resume
         │
         ├──────────────────┐
         ▼                  ▼
┌─────────────────┐   ┌─────────────────┐
│ Click "Edit"    │   │ Click "Download"│
│ → /builder?id=  │   │ → GET /pdf      │
└─────────────────┘   └─────────────────┘
```

### Journey 3: Resume Editing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RESUME EDITING JOURNEY                                │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: User clicks "Edit Resume" from Viewer
         │
         ▼
┌─────────────────┐
│ Navigate to     │
│ /builder?id=xyz │
└────────┬────────┘
         │
Step 2: Builder loads
         │
         ▼
┌─────────────────┐
│ GET /resumes/   │
│ {id}            │
└────────┬────────┘
         │
         │ (resume_data)
         ▼
┌─────────────────────────────────────────────┐
│                 BUILDER UI                  │
├─────────────────────┬───────────────────────┤
│   EDITOR PANEL      │    LIVE PREVIEW       │
│                     │                       │
│ ┌─────────────────┐ │ ┌───────────────────┐ │
│ │ FormattingCtrl  │ │ │ PaginatedPreview  │ │
│ │ - Template      │ │ │                   │ │
│ │ - Page Size     │ │ │ ┌───────────────┐ │ │
│ │ - Margins       │ │ │ │   Page 1      │ │ │
│ └─────────────────┘ │ │ │               │ │ │
│                     │ │ └───────────────┘ │ │
│ ┌─────────────────┐ │ │                   │ │
│ │ ResumeForm      │ │ │ ┌───────────────┐ │ │
│ │ - Personal Info │ │ │ │   Page 2      │ │ │
│ │ - Experience    │ │ │ │               │ │ │
│ │ - Education     │ │ │ └───────────────┘ │ │
│ │ - Projects      │ │ │                   │ │
│ │ - Skills        │ │ └───────────────────┘ │
│ └─────────────────┘ │                       │
└─────────────────────┴───────────────────────┘
         │
Step 3: User edits fields
         │
         ▼
┌─────────────────┐
│ Auto-save to    │
│ localStorage    │
│ (debounced)     │
└────────┬────────┘
         │
Step 4: User clicks "Save"
         │
         ▼
┌─────────────────┐
│ PATCH /resumes/ │
│ {id}            │
│ {resume_data}   │
└────────┬────────┘
         │
Step 5: User clicks "Download"
         │
         ▼
┌─────────────────┐
│ GET /resumes/   │
│ {id}/pdf        │
│ ?template=...   │
│ &pageSize=...   │
│ &margins=...    │
└─────────────────┘
```

---

## Function Reference by File

### Backend Function Map

| File | Function | Called By | Calls | DB | LLM |
|------|----------|-----------|-------|----|----|
| `routers/resumes.py` | `upload_resume()` | HTTP POST | `save_resume()`, `process_resume()` | W | - |
| `routers/resumes.py` | `process_resume()` | Background | `parse_document()`, `parse_resume_to_json()`, `update_resume()` | W | Y |
| `routers/resumes.py` | `get_resume()` | HTTP GET | `db.get_resume()` | R | - |
| `routers/resumes.py` | `list_resumes()` | HTTP GET | `db.list_resumes()` | R | - |
| `routers/resumes.py` | `update_resume()` | HTTP PATCH | `db.update_resume()` | W | - |
| `routers/resumes.py` | `delete_resume()` | HTTP DELETE | `db.delete_resume()` | D | - |
| `routers/resumes.py` | `improve_resume()` | HTTP POST | `extract_job_keywords()`, `improve_resume()`, `save_resume()`, `save_improvement()` | W | Y |
| `routers/resumes.py` | `get_resume_pdf()` | HTTP GET | `render_resume_pdf()` | R | - |
| `routers/jobs.py` | `upload_jobs()` | HTTP POST | `db.save_job()` | W | - |
| `routers/config.py` | `get_llm_config()` | HTTP GET | `settings.get()` | - | - |
| `routers/config.py` | `update_llm_config()` | HTTP PUT | `settings.update()`, `check_llm_health()` | - | Y |
| `routers/config.py` | `test_llm()` | HTTP POST | `check_llm_health()` | - | Y |
| `routers/health.py` | `get_status()` | HTTP GET | `db.count_*()`, `check_llm_health()` | R | Y |
| `services/parser.py` | `parse_document()` | `process_resume()` | PyMuPDF/docx2txt | - | - |
| `services/parser.py` | `parse_resume_to_json()` | `process_resume()` | `complete_json()` | - | Y |
| `services/improver.py` | `extract_job_keywords()` | `improve_resume()` | `complete_json()` | - | Y |
| `services/improver.py` | `improve_resume()` | Router | `complete_json()` | - | Y |
| `llm.py` | `complete()` | Various | LiteLLM | - | Y |
| `llm.py` | `complete_json()` | Various | `complete()` | - | Y |
| `llm.py` | `check_llm_health()` | Config/Health | LiteLLM | - | Y |
| `pdf.py` | `render_resume_pdf()` | `get_resume_pdf()` | Playwright | - | - |
| `database.py` | `save_resume()` | Various | TinyDB | W | - |
| `database.py` | `get_resume()` | Various | TinyDB | R | - |
| `database.py` | `update_resume()` | Various | TinyDB | W | - |
| `database.py` | `delete_resume()` | Router | TinyDB | D | - |
| `database.py` | `list_resumes()` | Router | TinyDB | R | - |

**Legend:** R = Read, W = Write, D = Delete, Y = Yes

---

## Error Handling Flows

### LLM Failure During Upload

```
Upload → Parse Document → LLM Call (FAILS)
                              │
                              ▼
                    ┌─────────────────┐
                    │ Update resume   │
                    │ status: "failed"│
                    │ error: message  │
                    └─────────────────┘
                              │
                              ▼
                    Frontend shows error
                    state on resume card
```

### Database Connection Failure

```
Any DB Operation (FAILS)
         │
         ▼
┌─────────────────┐
│ HTTPException   │
│ 500 Internal    │
│ Server Error    │
└─────────────────┘
         │
         ▼
Frontend shows
error toast
```

### PDF Generation Failure

```
GET /pdf → Playwright Launch (FAILS)
                    │
                    ▼
          ┌─────────────────┐
          │ HTTPException   │
          │ 500 + message   │
          │ "PDF generation │
          │  failed"        │
          └─────────────────┘
                    │
                    ▼
          Frontend shows
          error dialog
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW OVERVIEW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   User Device   │
                    │  (Browser)      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌─────────────┐  ┌───────────┐  ┌───────────┐
     │ PDF/DOCX    │  │ JSON Data │  │ JD Text   │
     │ Upload      │  │ (PATCH)   │  │ (POST)    │
     └──────┬──────┘  └─────┬─────┘  └─────┬─────┘
            │               │              │
            ▼               ▼              ▼
     ┌──────────────────────────────────────────┐
     │              FastAPI Backend             │
     │                                          │
     │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
     │  │ Routers  │──│ Services │──│  LLM   │ │
     │  └────┬─────┘  └────┬─────┘  └────────┘ │
     │       │             │                    │
     │       ▼             ▼                    │
     │  ┌──────────────────────┐               │
     │  │      TinyDB          │               │
     │  │   data/db.json       │               │
     │  │                      │               │
     │  │  ┌────────┐ ┌──────┐ │               │
     │  │  │resumes │ │ jobs │ │               │
     │  │  └────────┘ └──────┘ │               │
     │  │  ┌─────────────────┐ │               │
     │  │  │  improvements   │ │               │
     │  │  └─────────────────┘ │               │
     │  └──────────────────────┘               │
     │                                          │
     │  ┌──────────────────────┐               │
     │  │   File System        │               │
     │  │   data/uploads/      │               │
     │  │   {id}/original.pdf  │               │
     │  └──────────────────────┘               │
     │                                          │
     └──────────────────────────────────────────┘
                             │
                             ▼
     ┌──────────────────────────────────────────┐
     │           External Services              │
     │                                          │
     │  ┌──────────┐  ┌──────────┐             │
     │  │ LiteLLM  │──│ Provider │             │
     │  │ Gateway  │  │ APIs     │             │
     │  └──────────┘  └──────────┘             │
     │                                          │
     │  ┌──────────────────────┐               │
     │  │ Playwright/Chromium  │               │
     │  │ (PDF Rendering)      │               │
     │  └──────────────────────┘               │
     │                                          │
     └──────────────────────────────────────────┘
```

---

## Extension Points for i18n

### Backend Text Strings

| Location | Type | Example |
|----------|------|---------|
| `prompts/templates.py` | LLM Prompts | "Extract the following from this resume..." |
| `routers/*.py` | Error messages | "Resume not found" |
| `schemas/models.py` | Field descriptions | "Full name of the person" |

### Frontend Text Strings

| Location | Type | Example |
|----------|------|---------|
| Page components | UI labels | "Create Resume", "Download" |
| Components | Button text | "Save", "Cancel", "Delete" |
| Dialogs | Messages | "Are you sure you want to delete?" |
| Form fields | Placeholders | "Enter job description..." |

See `docs/i18n-preparation.md` for detailed extraction plan.
