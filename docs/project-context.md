# Resume Matcher - Project Context

## Architecture Overview

### Technology Stack
- **Backend**: FastAPI with Python 3.12+, uvicorn
- **Frontend**: Next.js 15, React 19, TypeScript 5
- **Database**: SQLite with SQLAlchemy 2.0.40
- **AI Processing**: Ollama (gemma3:4b), OpenAI fallback
- **Document Processing**: MarkItDown for PDF/DOCX parsing
- **Vector Embeddings**: nomic-embed-text via Ollama
- **Package Management**: uv (Python), npm (frontend)

### Structure
```
/
├── apps/
│   ├── backend/          # FastAPI backend
│   └── frontend/         # Next.js frontend
└── docs/                 # Documentation
```

## Core Features

### Resume Processing
- Upload and parse PDF/DOCX resumes
- Extract structured data using AI
- Store parsed content in SQLite database

### Job Description Analysis
- Parse job descriptions into structured data
- Extract key requirements and skills
- Generate keyword lists for matching

### Resume-Job Matching
- Compare resumes to job descriptions
- Calculate match scores using vector similarity
- Identify strengths and gaps

### Resume Improvement
- Generate tailored improvements for specific jobs
- Provide actionable feedback on content
- Show before/after comparisons

## Data Models

### Core Tables
- **resumes**: Raw uploaded resume content
- **processed_resumes**: AI-extracted structured data
- **jobs**: Job description content
- **processed_jobs**: Structured job data
- **job_resume_association**: Many-to-many mapping

## API Endpoints

### Resume Endpoints
- `POST /api/v1/resumes/upload`: Upload PDF/DOCX
- `GET /api/v1/resumes?resume_id=<id>`: Get resume data
- `GET /api/v1/resumes/{id}/preview`: Get frontend-ready format
- `POST /api/v1/resumes/improve`: Generate improved version

### Job Endpoints
- `POST /api/v1/jobs/upload`: Upload job description
- `GET /api/v1/jobs?job_id=<id>`: Get job data

### Matching Endpoints
- `GET /api/v1/resumes/{id}/matches/{job_id}/score`: Get match score

## Security and Privacy

- Local processing using Ollama for privacy
- No telemetry or analytics collection
- Optional data encryption at rest
- Input validation and sanitization
