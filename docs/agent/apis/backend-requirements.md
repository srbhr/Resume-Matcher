# Backend API Requirements

> API contract specifications for Resume Matcher.

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

Currently none (local-first design).

## Endpoints

### Health & Status

```
GET /health           → {healthy, provider, model, error?}
GET /status           → {status, llm_configured, llm_healthy, database_stats}
```

### Configuration

```
GET /config/llm-api-key    → {provider, model, api_key(masked), api_base?}
PUT /config/llm-api-key    ← {provider, model, api_key, api_base?}
POST /config/llm-test      → {healthy, provider, model}
GET /config/features       → {enable_cover_letter, enable_outreach_message, enable_interview_prep}
PUT /config/features       ← {enable_cover_letter?, enable_outreach_message?, enable_interview_prep?}
```

### Resumes

```
POST /resumes/upload       ← multipart/form-data {file}
                           → {resume_id}
GET /resumes?resume_id=    → Resume object
GET /resumes/list          → [{resume_id, filename, is_master, created_at}]
PATCH /resumes/{id}        ← ResumeData
DELETE /resumes/{id}       → {message}
GET /resumes/{id}/pdf      → application/pdf
POST /resumes/improve      ← {resume_id, job_id}
                           → {data, cover_letter?, outreach_message?, interview_prep?}
POST /resumes/{id}/generate-interview-prep
                           → {interview_prep, message}
```

### Jobs

```
POST /jobs/upload          ← {job_descriptions: [], resume_id?}
                           → {job_id: []}
GET /jobs/{id}             → {job_id, content, created_at}
```

## Request/Response Formats

### Resume Object
```json
{
  "resume_id": "uuid",
  "content": "markdown or json",
  "processed_data": {
    "personalInfo": {...},
    "summary": "...",
    "workExperience": [...],
    "education": [...],
    "additional": {...}
  },
  "is_master": true,
  "processing_status": "ready|processing|failed",
  "cover_letter": "text or null",
  "outreach_message": "text or null",
  "interview_prep": "structured object or null"
}
```

### ResumeData
`PATCH /resumes/{id}` accepts the structured resume payload stored in
`processed_data`, for example:

```json
{
  "personalInfo": {...},
  "summary": "...",
  "workExperience": [...],
  "education": [...],
  "personalProjects": [...],
  "additional": {...},
  "customSections": {...},
  "sectionMeta": [...]
}
```

### Error Response
```json
{
  "detail": "Error message"
}
```

## Status Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request |
| 404 | Not found |
| 413 | File too large (>4MB) |
| 422 | Parsing failed |
| 500 | Server error |
| 503 | PDF rendering failed |
