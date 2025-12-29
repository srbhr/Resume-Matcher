# Backend Requirements Document

This document defines the backend API requirements based on the frontend implementation analysis. Use this as the source of truth for implementing/updating the FastAPI backend.

## Executive Summary

The frontend is fully implemented and expects the following API endpoints:

| Endpoint | Method | Status | Priority |
|----------|--------|--------|----------|
| `/api/v1/resumes/upload` | POST | Required | High |
| `/api/v1/resumes` | GET | Required | High |
| `/api/v1/resumes/list` | GET | Required | High |
| `/api/v1/resumes/{id}` | PATCH | Required | High |
| `/api/v1/resumes/{id}/pdf` | GET | Required | High |
| `/api/v1/jobs/upload` | POST | Required | High |
| `/api/v1/resumes/improve` | POST | Required | High |
| `/api/v1/config/llm-api-key` | GET | Required | Medium |
| `/api/v1/config/llm-api-key` | PUT | Required | Medium |

---

## 1. Resume Upload Endpoint

**Purpose:** Upload a raw resume file (PDF/DOCX), convert to Markdown, and store it.

### Request

```
POST /api/v1/resumes/upload
Content-Type: multipart/form-data
```

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Resume file (PDF, DOC, DOCX). Max 4MB |

**Accepted MIME Types:**
- `application/pdf`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

### Response (200 OK)

```json
{
  "message": "File <filename> successfully processed as MD and stored in the DB",
  "request_id": "uuid-string",
  "resume_id": "uuid-string"
}
```

### Error Responses

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Invalid file type or empty file | `{ "detail": "Invalid file type" }` |
| 413 | File exceeds 4MB | `{ "detail": "File too large" }` |
| 422 | Validation/processing failure | `{ "detail": "..." }` |

### Backend Implementation Notes

1. **File Processing Pipeline:**
   - Accept multipart file upload
   - Validate file type and size
   - Convert PDF/DOCX to Markdown using appropriate library
   - Generate UUID for `resume_id`
   - Store raw content in database

2. **Database Schema (raw_resume):**
   ```sql
   CREATE TABLE raw_resumes (
     id SERIAL PRIMARY KEY,
     resume_id UUID UNIQUE NOT NULL,
     content TEXT NOT NULL,          -- Markdown content
     content_type VARCHAR(10) DEFAULT 'md',
     original_filename VARCHAR(255),
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

---

## 2. Fetch Resume Endpoint

**Purpose:** Retrieve structured data for a specific resume (Master or Tailored).

### Request

```
GET /api/v1/resumes?resume_id=<uuid>
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `resume_id` | UUID | Yes | The resume identifier |

### Response (200 OK)

```json
{
  "request_id": "uuid-string",
  "data": {
    "resume_id": "uuid-string",
    "raw_resume": {
      "id": 123,
      "content": "string (JSON stringified or Markdown text)",
      "content_type": "md",
      "created_at": "2025-01-15T10:30:00Z"
    },
    "processed_resume": {
      "personalInfo": {
        "name": "John Doe",
        "title": "Senior Software Engineer",
        "email": "john@example.com",
        "phone": "+1-555-0100",
        "location": "San Francisco, CA",
        "website": "https://johndoe.dev",
        "linkedin": "linkedin.com/in/johndoe",
        "github": "github.com/johndoe"
      },
      "summary": "Experienced software engineer with 10+ years...",
      "workExperience": [
        {
          "id": 1,
          "title": "Senior Engineer",
          "company": "Tech Corp",
          "location": "San Francisco, CA",
          "years": "2020 - Present",
          "description": [
            "Led team of 5 engineers",
            "Increased performance by 40%"
          ]
        }
      ],
      "education": [
        {
          "id": 1,
          "institution": "MIT",
          "degree": "BS Computer Science",
          "years": "2010 - 2014",
          "description": "Magna Cum Laude"
        }
      ],
      "personalProjects": [
        {
          "id": 1,
          "name": "Open Source Tool",
          "role": "Creator",
          "years": "2022 - Present",
          "description": [
            "Built CLI tool with 1000+ stars"
          ]
        }
      ],
      "additional": {
        "technicalSkills": ["Python", "TypeScript", "React"],
        "languages": ["English", "Spanish"],
        "certificationsTraining": ["AWS Solutions Architect"],
        "awards": ["Best Engineer 2023"]
      },
      "processed_at": "2025-01-15T10:35:00Z"
    }
  }
}
```

**Note:** `processed_resume` may be `null` if the resume hasn't been parsed yet.

### Error Responses

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Missing `resume_id` | `{ "detail": "resume_id is required" }` |
| 404 | Resume not found | `{ "detail": "Resume not found" }` |

### Backend Implementation Notes

1. **Two-Stage Processing:**
   - `raw_resume`: Always present after upload
   - `processed_resume`: Populated after LLM parsing (can be async)

2. **Parsing Logic:**
   - Use LLM to extract structured data from Markdown
   - Store in `processed_resumes` table linked by `resume_id`

3. **Database Schema (processed_resume):**
   ```sql
   CREATE TABLE processed_resumes (
     id SERIAL PRIMARY KEY,
     resume_id UUID REFERENCES raw_resumes(resume_id),
     personal_info JSONB,
     summary TEXT,
     work_experience JSONB,
     education JSONB,
     personal_projects JSONB,
     additional JSONB,
     processed_at TIMESTAMP DEFAULT NOW()
   );
   ```

---

## 3. List Resumes Endpoint

**Purpose:** List resumes for dashboard tiles (default excludes the master resume).

### Request

```
GET /api/v1/resumes/list?include_master=false
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `include_master` | boolean | No | Include the master resume in results |

### Response (200 OK)

```json
{
  "request_id": "uuid-string",
  "data": [
    {
      "resume_id": "uuid-string",
      "filename": "tailored_resume.pdf",
      "is_master": false,
      "parent_id": "uuid-string",
      "processing_status": "ready",
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

## 4. Update Resume Endpoint

**Purpose:** Save edited resume JSON from the builder.

### Request

```
PATCH /api/v1/resumes/{resume_id}
Content-Type: application/json
```

**Request Body:** Same JSON schema as `processed_resume`.

### Response (200 OK)

Same response shape as **Fetch Resume Endpoint**.

## 5. Upload Job Description Endpoint

**Purpose:** Store job description text for use in resume tailoring.

### Request

```
POST /api/v1/jobs/upload
Content-Type: application/json
```

**Request Body:**
```json
{
  "job_descriptions": ["Raw text of the job description..."],
  "resume_id": "uuid-string (optional)"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_descriptions` | string[] | Yes | Array of JD texts |
| `resume_id` | UUID | No | Optional link to resume |

### Response (200 OK)

```json
{
  "message": "data successfully processed",
  "job_id": ["uuid-string"],
  "request": {
    "job_descriptions": ["..."],
    "resume_id": "uuid-string"
  }
}
```

**Note:** Returns array of `job_id` values corresponding to input array. Frontend currently sends single JD and uses `job_id[0]`.

### Error Responses

| Status | Condition | Response |
|--------|-----------|----------|
| 400 | Invalid payload | `{ "detail": "..." }` |
| 422 | Validation failure | `{ "detail": "..." }` |

### Backend Implementation Notes

1. **Storage:**
   ```sql
   CREATE TABLE job_descriptions (
     id SERIAL PRIMARY KEY,
     job_id UUID UNIQUE NOT NULL,
     resume_id UUID REFERENCES raw_resumes(resume_id),
     content TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

2. **Processing:**
   - Generate UUID for each job description
   - Optionally link to resume for tracking
   - Store raw text for later LLM processing

---

## 6. Improve/Tailor Resume Endpoint

**Purpose:** Trigger AI agent to optimize resume against job description.

### Request

```
POST /api/v1/resumes/improve
Content-Type: application/json
```

**Request Body:**
```json
{
  "resume_id": "uuid-string (Master Resume ID)",
  "job_id": "uuid-string (from job upload)"
}
```

### Response (200 OK)

```json
{
  "request_id": "uuid-string",
  "data": {
    "request_id": "uuid-string",
    "resume_id": "uuid-string (NEW tailored resume ID)",
    "job_id": "uuid-string",
    "original_score": 75,
    "new_score": 95,
    "resume_preview": {
      "personalInfo": {
        "name": "John Doe",
        "title": "Senior Software Engineer",
        "email": "john@example.com",
        "phone": "+1-555-0100",
        "location": "San Francisco, CA",
        "website": "https://johndoe.dev",
        "linkedin": "linkedin.com/in/johndoe",
        "github": "github.com/johndoe"
      },
      "summary": "Tailored summary matching JD keywords...",
      "workExperience": [...],
      "education": [...],
      "personalProjects": [...],
      "additional": {
        "technicalSkills": [...],
        "languages": [...],
        "certificationsTraining": [...],
        "awards": [...]
      }
    },
    "improvements": [
      {
        "suggestion": "Added keyword 'cloud infrastructure'",
        "lineNumber": 10
      },
      {
        "suggestion": "Quantified achievement with metrics",
        "lineNumber": 25
      }
    ],
    "skill_comparison": [
      {
        "skill": "Python",
        "requiredLevel": "Expert",
        "currentLevel": "Advanced",
        "gap": "Minor gap"
      }
    ],
    "markdownOriginal": "# Original Resume\n...",
    "markdownImproved": "# Improved Resume\n..."
  }
}
```

### Error Responses

| Status | Condition | Response |
|--------|-----------|----------|
| 404 | Resume or Job not found | `{ "detail": "..." }` |
| 422 | Keyword extraction failed | `{ "detail": "..." }` |
| 500 | AI processing failure | `{ "detail": "..." }` |

### Backend Implementation Notes

1. **Processing Pipeline:**
   ```
   1. Fetch Master Resume (resume_id) from DB
   2. Fetch Job Description (job_id) from DB
   3. Extract keywords from JD using LLM
   4. Score original resume against JD
   5. Generate improved resume using LLM
   6. Score improved resume
   7. Generate improvement suggestions
   8. Create new resume entry (tailored version)
   9. Return comprehensive result
   ```

2. **LLM Prompts Required:**
   - Keyword extraction prompt
   - Resume scoring prompt
   - Resume improvement prompt
   - Suggestion generation prompt

3. **New Resume Storage:**
   - Create new `resume_id` for tailored version
   - Store with reference to original `resume_id` and `job_id`
   - Mark as `is_tailored = true`

4. **Extended Schema:**
   ```sql
   ALTER TABLE raw_resumes ADD COLUMN is_tailored BOOLEAN DEFAULT FALSE;
   ALTER TABLE raw_resumes ADD COLUMN parent_resume_id UUID;
   ALTER TABLE raw_resumes ADD COLUMN job_id UUID;

   CREATE TABLE improvement_results (
     id SERIAL PRIMARY KEY,
     request_id UUID UNIQUE NOT NULL,
     original_resume_id UUID NOT NULL,
     tailored_resume_id UUID NOT NULL,
     job_id UUID NOT NULL,
     original_score INTEGER,
     new_score INTEGER,
     improvements JSONB,
     skill_comparison JSONB,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

---

## 7. Download Resume PDF Endpoint

**Purpose:** Generate a pixel-perfect PDF for a resume using headless Chromium.

### Request

```
GET /api/v1/resumes/{resume_id}/pdf?template=default
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `template` | string | No | Template identifier (default: `default`) |

### Response (200 OK)

Binary PDF (`application/pdf`) with `Content-Disposition` attachment.

## 8. LLM API Key Configuration Endpoints

**Purpose:** Manage OpenAI API key for LLM features.

### Fetch API Key

```
GET /api/v1/config/llm-api-key
```

**Response (200 OK):**
```json
{
  "api_key": "sk-..."
}
```

**Note:** Consider returning masked key for security (e.g., `sk-...xxxx`).

### Update API Key

```
PUT /api/v1/config/llm-api-key
Content-Type: application/json
```

**Request Body:**
```json
{
  "api_key": "sk-new-key-here"
}
```

**Response (200 OK):**
```json
{
  "message": "API key updated successfully"
}
```

### Backend Implementation Notes

1. **Storage Options:**
   - Environment variable (preferred for production)
   - Database with encryption
   - Config file (development only)

2. **Security:**
   - Encrypt at rest if stored in DB
   - Never log the full key
   - Validate key format before storing

---

## 9. Data Type Definitions

### PersonalInfo
```typescript
interface PersonalInfo {
  name: string
  title: string
  email: string
  phone: string
  location: string
  website?: string
  linkedin?: string
  github?: string
}
```

### Experience
```typescript
interface Experience {
  id: number
  title: string           // Job title/role
  company: string
  location?: string
  years: string           // e.g., "2020 - Present"
  description: string[]   // Bullet points
}
```

### Education
```typescript
interface Education {
  id: number
  institution: string
  degree: string
  years: string           // e.g., "2014 - 2018"
  description?: string
}
```

### Project
```typescript
interface Project {
  id: number
  name: string
  role: string
  years: string           // e.g., "2022 - Present"
  description: string[]   // Bullet points
}
```

### AdditionalInfo
```typescript
interface AdditionalInfo {
  technicalSkills: string[]
  languages: string[]
  certificationsTraining: string[]
  awards: string[]
}
```

### ResumePreview (Complete)
```typescript
interface ResumePreview {
  personalInfo: PersonalInfo
  summary: string
  workExperience: Experience[]
  education: Education[]
  personalProjects: Project[]
  additional: AdditionalInfo
}
```

---

## 10. CORS Configuration

The frontend runs on `localhost:3000` and expects the backend on `localhost:8000`.

**Required CORS Settings:**
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 11. Frontend API Client Reference

The frontend makes API calls from these files:

| File | Functions | Endpoints Used |
|------|-----------|----------------|
| `lib/api/resume.ts` | `uploadJobDescriptions()` | POST /jobs/upload |
| `lib/api/resume.ts` | `improveResume()` | POST /resumes/improve |
| `lib/api/resume.ts` | `fetchResume()` | GET /resumes |
| `lib/api/resume.ts` | `fetchResumeList()` | GET /resumes/list |
| `lib/api/resume.ts` | `updateResume()` | PATCH /resumes/{id} |
| `lib/api/resume.ts` | `downloadResumePdf()` | GET /resumes/{id}/pdf |
| `lib/api/config.ts` | `fetchLlmApiKey()` | GET /config/llm-api-key |
| `lib/api/config.ts` | `updateLlmApiKey()` | PUT /config/llm-api-key |
| `hooks/use-file-upload.ts` | Upload handler | POST /resumes/upload |

**Base URL:** `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'`

---

## 12. Implementation Checklist

### Phase 1: Core APIs (Required for MVP)
- [ ] `POST /api/v1/resumes/upload` - File upload with PDF/DOCX to MD conversion
- [ ] `GET /api/v1/resumes` - Fetch resume by ID
- [ ] `GET /api/v1/resumes/list` - List resumes for dashboard tiles
- [ ] `PATCH /api/v1/resumes/{id}` - Update resume JSON
- [ ] `GET /api/v1/resumes/{id}/pdf` - Download resume PDF
- [ ] `POST /api/v1/jobs/upload` - Store job descriptions
- [ ] `POST /api/v1/resumes/improve` - AI-powered resume tailoring

### Phase 2: Configuration
- [ ] `GET /api/v1/config/llm-api-key` - Fetch API key
- [ ] `PUT /api/v1/config/llm-api-key` - Update API key

### Phase 3: Enhancements
- [ ] Resume parsing pipeline (Markdown to structured JSON)
- [ ] Score calculation algorithm
- [ ] Improvement suggestion generation
- [ ] Skill gap analysis

### Phase 4: Persistence
- [ ] Database migrations
- [ ] Resume versioning (track tailored versions)
- [ ] Job description archiving

---

## 13. Testing Requirements

### API Contract Tests
Each endpoint should have tests verifying:
1. Success response structure matches this document
2. Error responses include proper status codes
3. Validation errors return 422 with details

### Integration Tests
1. Full workflow: Upload → Fetch → Tailor → View
2. Error handling for missing resources
3. File type validation
4. Size limit enforcement

---

## Appendix: Current Backend Structure

Based on `AGENTS.md`, the backend is organized as:

```
apps/backend/app/
├── agent/          # LLM agent wrappers
│   └── manager.py  # Agent registration
├── services/       # Business logic orchestration
│   └── score_improvement_service.py
├── prompt/         # LLM prompt templates
├── schemas/        # Pydantic models & JSON contracts
└── main.py         # FastAPI application
```

Refer to `apps/backend/app/services/score_improvement_service.py` for the existing improvement logic pattern.
