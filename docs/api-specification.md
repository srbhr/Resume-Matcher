# API Specification and Endpoints

## Base Configuration
```python
API_BASE_URL = "http://localhost:8000"
API_VERSION = "v1"
FULL_API_URL = f"{API_BASE_URL}/api/{API_VERSION}"

app = FastAPI(
    title="Resume Matcher",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
```

## Core Endpoints

### Health
```http
GET /health
Response: {"status": "healthy", "timestamp": "2024-01-15T10:30:00Z"}

GET /health/detailed
Response: {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0.0",
    "services": {
        "database": {"status": "connected"},
        "ai_processor": {"status": "ready", "model": "gemma3:4b"}
    }
}
```

### Resume Processing
```http
POST /api/v1/resumes/upload
Content-Type: multipart/form-data

Request: 
- file: binary (PDF/DOCX, max 10MB)

Response:
{
    "request_id": "uuid-string",
    "data": {
        "resume_id": "resume_abc123",
        "message": "Resume processed successfully"
    }
}
```

### Resume Data Retrieval
```http
GET /api/v1/resumes?resume_id=resume_abc123

Response:
{
    "request_id": "uuid-string",
    "data": {
        "raw_resume": {
            "resume_id": "resume_abc123",
            "content": "# John Smith\n## Experience\n...",
            "content_type": "md"
        },
        "processed_resume": {
            "personal_data": {...},
            "experiences": [{...}],
            "skills": [{...}],
            "extracted_keywords": [...]
        }
    }
}
```

### Job Matching
```http
POST /api/v1/jobs/upload
Content-Type: application/json

Request:
{
    "content": "# Job Title\n\nRequirements:\n- Skill 1\n- Skill 2",
    "content_type": "md"
}

GET /api/v1/resumes/{resume_id}/matches/{job_id}/score

Response:
{
    "overall_score": 72.5,
    "category_scores": {
        "technical_skills": 85.2,
        "experience_level": 78.0
    },
    "matched_keywords": ["Python", "AWS"],
    "missing_keywords": ["Docker", "Kubernetes"]
}
```

### Resume Improvement
```http
POST /api/v1/resumes/improve
Content-Type: application/json

Request:
{
    "resume_id": "uuid-string",
    "job_id": "uuid-string"
}

Response:
{
    "request_id": "uuid-string",
    "data": {
        "original_score": 65.4,
        "new_score": 82.1,
        "resume_preview": {...}
    }
}
```
