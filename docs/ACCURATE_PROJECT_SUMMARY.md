# Resume Matcher - Accurate Project Summary

## Overview

Resume Matcher is an AI-powered application that helps job seekers optimize their resumes for specific job descriptions. The application processes resume files (PDF/DOCX) and job descriptions to provide match scores, keyword analysis, and improvement suggestions using local AI models.

## Technology Stack (As Actually Implemented)

### Backend - FastAPI Python Application
- **Framework**: FastAPI with Python 3.12+
- **Server**: uvicorn (v0.34.1)
- **Database**: SQLite with aiosqlite (v0.20.0) async driver
- **ORM**: SQLAlchemy 2.0.40 with async support
- **Package Manager**: uv (not pip/poetry as originally documented)

### Frontend - Next.js Application  
- **Framework**: Next.js 15 with React 19
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI components
- **Package Manager**: npm

### AI Processing Stack
- **Primary AI**: Ollama (v0.4.7) with gemma3:4b model for local inference
- **Fallback AI**: OpenAI (v1.75.0) API when available
- **Embeddings**: nomic-embed-text:137m-v1.5-fp16 via Ollama for vector similarity
- **Document Processing**: MarkItDown (v0.1.1) for PDF/DOCX parsing

### Monorepo Structure
```
/
├── package.json           # Root monorepo with concurrently for dev scripts
├── apps/
│   ├── backend/          # FastAPI Python backend
│   │   ├── pyproject.toml # uv package management
│   │   └── app/          # Application source
│   │       ├── agent/    # AI provider abstraction
│   │       ├── api/      # FastAPI routers
│   │       ├── core/     # Config, database, exceptions
│   │       ├── models/   # SQLAlchemy ORM models
│   │       ├── prompt/   # AI prompt templates
│   │       ├── schemas/  # JSON schemas and Pydantic models
│   │       └── services/ # Business logic layer
│   └── frontend/         # Next.js React frontend
│       └── package.json  # Frontend dependencies
└── docs/                 # Project documentation
```

## Actual File Structure and Implementation

### Core Application Entry Points
- **Backend**: `apps/backend/app/main.py` - Creates FastAPI app via `create_app()` from `base.py`
- **Frontend**: `apps/frontend/app/layout.tsx` - Next.js root layout with Geist and Space Grotesk fonts

### Database Models (apps/backend/app/models/)
```python
# resume.py
class Resume(Base):
    __tablename__ = "resumes"
    id = Column(Integer, primary_key=True)
    resume_id = Column(String, unique=True, nullable=False)
    content = Column(Text, nullable=False)  # MarkItDown extracted text
    content_type = Column(String, nullable=False)  # "md"
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))

class ProcessedResume(Base):
    __tablename__ = "processed_resumes"
    resume_id = Column(String, ForeignKey("resumes.resume_id"), primary_key=True)
    personal_data = Column(JSON, nullable=False)
    experiences = Column(JSON, nullable=True)
    projects = Column(JSON, nullable=True)
    skills = Column(JSON, nullable=True)
    research_work = Column(JSON, nullable=True)
    achievements = Column(JSON, nullable=True)
    education = Column(JSON, nullable=True)
    extracted_keywords = Column(JSON, nullable=True)
    processed_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))

# job.py
class Job(Base):
    __tablename__ = "jobs"
    # Similar structure to Resume

class ProcessedJob(Base):
    __tablename__ = "processed_jobs"
    # Similar structure to ProcessedResume with job-specific fields
```

### API Endpoints (apps/backend/app/api/router/v1/)

#### Resume Endpoints (`resume.py`)
- `POST /api/v1/resumes/upload` - Upload PDF/DOCX resume file
- `GET /api/v1/resumes?resume_id=<id>` - Get resume data
- `POST /api/v1/resumes/improve` - Generate improved resume version

#### Job Endpoints (`job.py`)  
- `POST /api/v1/jobs/upload` - Upload job description JSON
- `GET /api/v1/jobs?job_id=<id>` - Get job data

#### Middleware Stack (`base.py`)
```python
app.add_middleware(SessionMiddleware, secret_key=settings.SESSION_SECRET_KEY)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"])
app.add_middleware(RequestIDMiddleware)  # Custom request tracking
```

### AI Agent System (apps/backend/app/agent/)

#### Manager Classes (`manager.py`)
```python
class AgentManager:
    def __init__(self, strategy: str | None = None, model: str = "gemma3:4b"):
        # Strategy: "json" (JSONWrapper) or "md" (MDWrapper)
        # Default model: gemma3:4b

class EmbeddingManager:
    def __init__(self, model: str = "nomic-embed-text:137m-v1.5-fp16"):
        # Handles vector embeddings for similarity calculation
```

#### Provider Classes (`providers/`)
- `ollama.py` - OllamaProvider and OllamaEmbeddingProvider for local AI
- `openai.py` - OpenAIProvider and OpenAIEmbeddingProvider for fallback

### JSON Schemas (apps/backend/app/schemas/json/)

#### Resume Schema (`structured_resume.py`)
```python
SCHEMA = {
    "UUID": "string",
    "Personal Data": {
        "firstName": "string", "lastName": "string", "email": "string",
        "phone": "string", "linkedin": "string", "portfolio": "string",
        "location": {"city": "string", "country": "string"}
    },
    "Experiences": [{
        "jobTitle": "string", "company": "string", "location": "string",
        "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD or Present",
        "description": ["string"], "technologiesUsed": ["string"]
    }],
    "Projects": [{
        "projectName": "string", "description": "string", 
        "technologiesUsed": ["string"], "link": "string",
        "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"
    }],
    "Skills": [{"category": "string", "skillName": "string"}],
    "Research Work": [{
        "title": "string | null", "publication": "string | null",
        "date": "YYYY-MM-DD | null", "link": "string | null"
    }],
    "Achievements": ["string"],
    "Education": [{
        "institution": "string", "degree": "string", "fieldOfStudy": "string | null",
        "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "grade": "string"
    }],
    "Extracted Keywords": ["string"]
}
```

#### Job Schema (`structured_job.py`)
```python
SCHEMA = {
    "jobId": "string", "jobTitle": "string",
    "companyProfile": {
        "companyName": "string", "industry": "Optional[string]",
        "website": "Optional[string]", "description": "Optional[string]"
    },
    "location": {
        "city": "string", "state": "string", "country": "string", "remoteStatus": "string"
    },
    "datePosted": "YYYY-MM-DD", "employmentType": "string", "jobSummary": "string",
    "keyResponsibilities": ["string"],
    "qualifications": {"required": ["string"], "preferred": ["string"]},
    "compensationAndBenefits": {"salaryRange": "string", "benefits": ["string"]},
    "applicationInfo": {"howToApply": "string", "applyLink": "string"},
    "extractedKeywords": ["string"]
}
```

### AI Prompts (apps/backend/app/prompt/)

#### Structured Extraction (`structured_resume.py`, `structured_job.py`)
```python
PROMPT = """
You are a JSON extraction engine. Convert the following resume text into precisely the JSON schema specified below.
- Do not compose any extra fields or commentary.
- Do not make up values for any fields.
- Use "Present" if an end date is ongoing.
- Make sure dates are in YYYY-MM-DD.
- Do not format the response in Markdown or any other format. Just output raw JSON.
"""
```

#### Resume Improvement (`resume_improvement.py`)
```python
PROMPT = """
You are an expert resume writer. Enhance the following resume to better align with the job description while maintaining authenticity and professionalism.

Job Description:
{raw_job_description}

Extracted Job Keywords:
{extracted_job_keywords}

Original Resume:  
{raw_resume}

NOTE: ONLY OUTPUT THE IMPROVED UPDATED RESUME IN MARKDOWN FORMAT.
"""
```

### Service Layer (apps/backend/app/services/)

#### ResumeService (`resume_service.py`)
- Uses MarkItDown for PDF/DOCX parsing
- Stores raw resume content and structured data
- Integrates with AgentManager for AI processing

#### JobService (`job_service.py`)  
- Processes job description text
- Extracts structured job data using AI
- Links jobs to resumes for matching

#### ScoreImprovementService (`score_improvement_service.py`)
- Calculates cosine similarity using embeddings
- Iterative resume improvement (max 5 retries)
- Uses both AgentManager and EmbeddingManager

### Development Setup

#### Backend Dependencies (pyproject.toml)
```toml
[project]
requires-python = ">=3.12"
dependencies = [
    "fastapi==0.116.5",
    "uvicorn==0.34.1", 
    "sqlalchemy==2.0.40",
    "aiosqlite==0.20.0",
    "markitdown==0.1.1",
    "ollama==0.4.7",
    "openai==1.75.0",
    "pydantic==2.10.8",
    "pydantic-settings==2.7.0"
]
```

#### Root Package Scripts (package.json)
```json
{
  "scripts": {
    "dev": "concurrently \"cd apps/backend && uv run uvicorn app.main:app --reload\" \"cd apps/frontend && npm run dev\"",
    "start": "concurrently \"cd apps/backend && uv run uvicorn app.main:app\" \"cd apps/frontend && npm start\"",
    "install": "cd apps/backend && uv sync && cd ../frontend && npm install"
  },
  "devDependencies": {
    "concurrently": "^9.1.2"
  }
}
```

## Key Differences from Original Documentation

1. **Package Manager**: Uses `uv` instead of `pip` or `poetry`
2. **Document Processing**: Uses `MarkItDown` instead of `PyPDF2` or `python-docx`
3. **AI Models**: Uses `gemma3:4b` and `nomic-embed-text` instead of generic models
4. **Database**: Specific SQLAlchemy async setup with JSON column types
5. **Architecture**: Service-oriented with agent abstraction layer
6. **Frontend**: Next.js 15 with React 19 and Tailwind CSS v4
7. **Monorepo**: Uses `concurrently` for orchestrating backend/frontend development

This represents the actual implementation as discovered through code analysis of the Resume Matcher project.
