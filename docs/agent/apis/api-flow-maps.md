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
└── Return {status: "healthy"}        # pure liveness — does NOT call the LLM
```

## System Status

```
GET /api/v1/status                    # each check isolated → 200 (partial/degraded), never 500
├── try: get_llm_config()
│   ├── llm_configured = api_key set OR provider ∈ {ollama, openai_compatible}
│   └── check_llm_health() → llm_healthy   # failure here degrades only this field
├── try: db.get_stats()                     # failure → empty stats, still 200
└── Return {status, llm_configured, llm_healthy, has_master_resume, database_stats}
```

## Configuration Update

```
PUT /api/v1/config/llm-api-key
├── _load_config()
├── Merge new NON-SECRET values (provider/model/base/...)
├── (no longer persists any key — keys go through /config/api-keys)
├── _save_config()
└── Return masked config
```

## API Keys (per-provider, encrypted)

```
GET /api/v1/config/api-keys
└── Return {providers: [{provider, configured, masked_key}]}   # always masked

POST /api/v1/config/api-keys
├── For each provided provider key:
│   └── Fernet-encrypt → upsert into SQLite `api_keys` table   # other providers' keys untouched
└── Return {message, updated_providers}

DELETE /api/v1/config/api-keys/{provider}      # remove one provider's key
DELETE /api/v1/config/api-keys?confirm=...     # clear all keys
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

## Application Tracker

```
GET /api/v1/applications
├── db.list_applications()
└── Return {columns}        # grouped by the 7 status keys (all present):
                            #   saved/applied/no_response/response/interview/accepted/rejected

POST /api/v1/applications   # manual add from a pasted JD
├── db.create_job(jd)
├── [If company/role missing] extract_job_keywords() → LLM   # one best-effort call
├── db.create_application(status default "applied")          # dedupes on (job_id, resume_id)
└── Return Application

GET /api/v1/applications/{id}
├── db.get_application() + embed job_content + applied resume
└── Return {..., job_content, resume}    # resume: null if it was deleted
```

| Endpoint | Flow |
|----------|------|
| `PATCH /applications/{id}` | db.update_application() — status/position/notes/company/role/applied_at; server renumbers `position` |
| `PATCH /applications/bulk` | db.bulk_update_status() — move many cards to one column |
| `DELETE /applications/{id}` | db.delete_application() |
| `POST /applications/bulk-delete` | db.bulk_delete_applications() |

> **Auto-create:** `POST /resumes/improve/confirm` (and legacy `POST /resumes/improve`) create an `applied` card after persisting the tailored resume — best-effort (a tracker failure never breaks tailoring); company/role reuse the cached keyword extraction, so no extra LLM call.
