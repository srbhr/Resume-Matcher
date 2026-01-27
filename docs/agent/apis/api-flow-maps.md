# API Flow Maps

> Request/response flows for all Resume Matcher endpoints.

## Resume Upload

```
POST /api/v1/resumes/upload
├── Validate file (PDF/DOCX, ≤4MB)
├── parse_document() → Markdown
├── db.create_resume(status="processing")
├── parse_resume_to_json() → LLM
│   ├── Success: status="ready"
│   └── Failure: status="failed"
└── Return {resume_id}
```

## Resume Improvement

```
POST /api/v1/resumes/improve
├── Fetch resume + job from DB
├── extract_job_keywords() → LLM
├── improve_resume() → LLM
├── [If enabled] generate_cover_letter() → LLM
├── [If enabled] generate_outreach_message() → LLM
├── db.create_resume(improved)
├── db.create_improvement()
└── Return {data, cover_letter, outreach_message}
```

## PDF Generation

```
GET /api/v1/resumes/{id}/pdf
├── Fetch resume from DB
├── Build URL: {frontend}/print/resumes/{id}?{params}
├── Playwright render (wait for .resume-print)
└── Return PDF bytes
```

## Health Check

```
GET /api/v1/health
├── check_llm_health() → 30s timeout
└── Return {healthy, provider, model}
```

## System Status

```
GET /api/v1/status
├── get_llm_config()
├── check_llm_health()
├── db.get_stats()
└── Return {status, llm_healthy, database_stats}
```

## Configuration Update

```
PUT /api/v1/config/llm-api-key
├── _load_config()
├── Merge new values
├── check_llm_health() → Validate
├── _save_config()
└── Return masked config
```

## Job Upload

```
POST /api/v1/jobs/upload
├── For each description:
│   └── db.create_job()
└── Return {job_id[]}
```

## Resume Operations

| Endpoint | Flow |
|----------|------|
| `GET /resumes?id=` | db.get_resume() |
| `GET /resumes/list` | db.list_resumes() |
| `PATCH /resumes/{id}` | db.update_resume() |
| `DELETE /resumes/{id}` | db.delete_resume() |
