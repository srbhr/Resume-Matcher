# Backend Architecture Guide

This document details the Resume Matcher backend architecture, design decisions, and implementation patterns.

## Overview

The backend is a **lean, local-first** FastAPI application designed for:

- Single-user local deployment
- Multi-provider AI support
- JSON-based storage (no database server required)
- Minimal dependencies

## Technology Stack

| Component      | Technology | Purpose                               |
| -------------- | ---------- | ------------------------------------- |
| Framework      | FastAPI    | Async API with automatic OpenAPI docs |
| Database       | TinyDB     | JSON file storage, zero configuration |
| AI Integration | LiteLLM    | Unified API for 100+ LLM providers    |
| Doc Parsing    | markitdown | PDF/DOCX to Markdown conversion       |
| Validation     | Pydantic   | Request/response schema validation    |

## Directory Structure

```
apps/backend/
├── app/
│   ├── __init__.py          # Package version
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Pydantic settings (env vars)
│   ├── database.py          # TinyDB wrapper
│   ├── llm.py               # LiteLLM multi-provider wrapper
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── health.py        # Health & status endpoints
│   │   ├── config.py        # LLM configuration endpoints
│   │   ├── resumes.py       # Resume CRUD & improvement
│   │   └── jobs.py          # Job description storage
│   ├── services/
│   │   ├── __init__.py
│   │   ├── parser.py        # Document parsing service
│   │   └── improver.py      # AI resume improvement service
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── models.py        # All Pydantic models
│   └── prompts/
│       ├── __init__.py
│       └── templates.py     # LLM prompt templates
├── data/                    # TinyDB storage directory
│   ├── .gitkeep
│   ├── database.json        # Main data (gitignored)
│   └── config.json          # LLM config (gitignored)
├── pyproject.toml           # Dependencies & build config
├── requirements.txt         # Pip-compatible deps
├── .env.example             # Environment template
└── .gitignore
```

## Core Modules

### 1. Configuration (`app/config.py`)

Uses `pydantic-settings` to load configuration from environment variables:

```python
class Settings(BaseSettings):
    llm_provider: Literal["openai", "anthropic", "openrouter", "gemini", "deepseek", "ollama"]
    llm_model: str
    llm_api_key: str
    llm_api_base: str | None  # For Ollama/custom endpoints
    host: str
    port: int
    data_dir: Path
```

Settings are loaded from:

1. Environment variables (highest priority)
2. `.env` file
3. Defaults

### 2. Database (`app/database.py`)

TinyDB wrapper providing typed access to collections:

```python
db = Database()

# Tables
db.resumes      # Resume documents
db.jobs         # Job descriptions
db.improvements # Improvement results

# Operations
db.create_resume(content, content_type, filename, is_master, processed_data)
db.get_resume(resume_id)
db.get_master_resume()
db.delete_resume(resume_id)  # Returns True if deleted, False if not found
db.list_resumes()            # Returns all resumes
db.set_master_resume(resume_id)  # Sets a resume as master
db.create_job(content, resume_id)
db.get_stats()
```

**Why TinyDB?**

- Pure Python, no server process
- Stores data as readable JSON
- Perfect for local single-user apps
- Easy backup (just copy the file)

### 3. LLM Integration (`app/llm.py`)

LiteLLM wrapper for multi-provider support with robust JSON handling:

```python
# Check provider health
health = await check_llm_health(config)

# Text completion
response = await complete(prompt, system_prompt, config)

# JSON completion (with JSON mode, retries, and extraction)
data = await complete_json(prompt, system_prompt, config, retries=2)
```

**Key Features:**

| Feature         | Description                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| API Key Passing | Keys passed directly to `litellm.acompletion()` via `api_key` param (avoids os.environ race conditions) |
| JSON Mode       | Auto-enables `response_format={"type": "json_object"}` for supported providers                          |
| Retry Logic     | 2 automatic retries with lower temperature on each attempt (0.1 → 0.0)                                  |
| JSON Extraction | Bracket-matching algorithm handles malformed responses and markdown blocks (with recursion guard)       |
| Timeouts        | Configurable per-operation: 30s (health), 120s (completion), 180s (JSON)                                |
| Error Handling  | Logs detailed errors server-side, returns generic messages to clients                                   |

**JSON Mode Support:**

```python
def _supports_json_mode(provider: str, model: str) -> bool:
    # Supported: openai, anthropic, gemini, deepseek
    # OpenRouter: claude, gpt-4, gpt-3.5, gemini, mistral models
```

**Supported Providers:**

| Provider      | Model Format                  | API Key Env Var      |
| ------------- | ----------------------------- | -------------------- |
| OpenAI        | `gpt-4o-mini`                 | `OPENAI_API_KEY`     |
| Anthropic     | `anthropic/claude-3-5-sonnet` | `ANTHROPIC_API_KEY`  |
| OpenRouter    | `openrouter/model-name`       | `OPENROUTER_API_KEY` |
| Google Gemini | `gemini/gemini-1.5-flash`     | `GEMINI_API_KEY`     |
| DeepSeek      | `deepseek/deepseek-chat`      | `DEEPSEEK_API_KEY`   |
| Ollama        | `ollama/llama3.2`             | None (local)         |

### 4. Services

#### Parser Service (`app/services/parser.py`)

Handles document conversion:

```python
# Convert PDF/DOCX to Markdown
markdown = await parse_document(file_bytes, filename)

# Parse Markdown to structured JSON via LLM
structured = await parse_resume_to_json(markdown_text)
```

#### Improver Service (`app/services/improver.py`)

AI-powered resume optimization:

```python
# Extract keywords from job description
keywords = await extract_job_keywords(job_description)

# Score resume against job requirements
score = await score_resume(resume_text, keywords)

# Generate improved resume
improved = await improve_resume(original, job_desc, score, keywords)
```

## API Endpoints

### Health & Status

| Endpoint             | Method | Description            |
| -------------------- | ------ | ---------------------- |
| `GET /api/v1/health` | GET    | LLM connectivity check |
| `GET /api/v1/status` | GET    | Full app status        |

**Status Response:**

```json
{
  "status": "ready | setup_required",
  "llm_configured": true,
  "llm_healthy": true,
  "has_master_resume": true,
  "database_stats": {
    "total_resumes": 5,
    "total_jobs": 3,
    "total_improvements": 2
  }
}
```

### Configuration

| Endpoint                         | Method | Description                                |
| -------------------------------- | ------ | ------------------------------------------ |
| `GET /api/v1/config/llm-api-key` | GET    | Get current config (key masked)            |
| `PUT /api/v1/config/llm-api-key` | PUT    | Update LLM config                          |
| `POST /api/v1/config/llm-test`   | POST   | Test LLM connection                        |
| `GET /api/v1/config/features`    | GET    | Get feature flags (cover letter, outreach) |
| `PUT /api/v1/config/features`    | PUT    | Update feature flags                       |
| `GET /api/v1/config/language`    | GET    | Get language preference                    |
| `PUT /api/v1/config/language`    | PUT    | Update language preference                 |

**Language Response:**

```json
{
  "language": "en",
  "supported_languages": ["en", "es", "zh", "ja"]
}
```

### Resumes

| Endpoint                         | Method | Description                              |
| -------------------------------- | ------ | ---------------------------------------- |
| `POST /api/v1/resumes/upload`    | POST   | Upload PDF/DOCX                          |
| `GET /api/v1/resumes?resume_id=` | GET    | Fetch resume by ID                       |
| `GET /api/v1/resumes/list`       | GET    | List resumes (optionally include master) |
| `PATCH /api/v1/resumes/{id}`     | PATCH  | Update resume JSON                       |
| `GET /api/v1/resumes/{id}/pdf`   | GET    | Download resume PDF                      |
| `POST /api/v1/resumes/improve`   | POST   | Tailor for job                           |
| `DELETE /api/v1/resumes/{id}`    | DELETE | Delete resume                            |

### Jobs

| Endpoint                   | Method | Description           |
| -------------------------- | ------ | --------------------- |
| `POST /api/v1/jobs/upload` | POST   | Store job description |
| `GET /api/v1/jobs/{id}`    | GET    | Fetch job by ID       |

## Data Flow

### Resume Upload Flow

```
1. User uploads PDF/DOCX
2. markitdown converts to Markdown
3. (Optional) LLM parses to structured JSON
4. Store in TinyDB with resume_id
5. Return resume_id to frontend
```

### Resume Improvement Flow

```
1. Frontend sends resume_id + job_id
2. Fetch resume and job from DB
3. Extract keywords from job description (LLM with JSON mode)
4. Generate improved/tailored resume (LLM with JSON mode + retries)
5. Store tailored resume with parent link
6. Return improvement results with resume_preview
```

**Note:** Scoring feature was removed in v1 to focus on keyword alignment quality.

### Resume Delete Flow

```
1. Frontend sends DELETE /api/v1/resumes/{resume_id}
2. Backend calls db.delete_resume(resume_id)
3. TinyDB removes the document from the resumes table
4. Return success message or 404 if not found
5. Frontend clears localStorage if deleting master resume
6. Frontend shows success confirmation dialog
7. Frontend redirects to dashboard
8. Dashboard refreshes resume list on focus
```

**Important Notes:**

- The `is_master` flag in the database and `master_resume_id` in localStorage can get out of sync
- Dashboard calls `GET /api/v1/resumes/list?include_master=true` to reconcile and recover the master resume when localStorage is stale
- Dashboard filters tailored resumes by BOTH `is_master` flag AND localStorage master ID
- Dashboard refreshes the resume list when the window gains focus (handles navigation back from viewer)

## Data Models

### Resume Data Structure (`app/schemas/models.py`)

The `ResumeData` model supports both default and custom sections:

```python
class ResumeData(BaseModel):
    personalInfo: PersonalInfo | None = None
    summary: str = ""
    workExperience: list[Experience] = []
    education: list[Education] = []
    personalProjects: list[Project] = []
    additional: AdditionalInfo | None = None

    # Dynamic section support
    sectionMeta: list[SectionMeta] = []      # Section order, names, visibility
    customSections: dict[str, CustomSection] = {}  # Custom section data
```

### Section Types

| Type           | Description                                             | Example Uses                       |
| -------------- | ------------------------------------------------------- | ---------------------------------- |
| `personalInfo` | Special type for header (always first)                  | Name, contact details              |
| `text`         | Single text block                                       | Summary, objective, statement      |
| `itemList`     | Array of items with title, subtitle, years, description | Experience, projects, publications |
| `stringList`   | Simple array of strings                                 | Skills, languages, hobbies         |

### Section Metadata (`SectionMeta`)

```python
class SectionMeta(BaseModel):
    id: str              # Unique identifier (e.g., "summary", "custom_1")
    key: str             # Data key in ResumeData
    displayName: str     # User-visible name (editable)
    sectionType: SectionType
    isDefault: bool = True
    isVisible: bool = True
    order: int = 0
```

### Custom Sections (`CustomSection`)

```python
class CustomSection(BaseModel):
    sectionType: SectionType
    items: list[CustomSectionItem] | None = None   # For itemList
    strings: list[str] | None = None               # For stringList
    text: str | None = None                        # For text
```

### Migration

Resumes without `sectionMeta` are automatically normalized via `normalize_resume_data()` when fetched from the API. This applies default section metadata lazily, ensuring backward compatibility.

## Prompt Templates

Located in `app/prompts/templates.py`:

| Prompt                    | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `PARSE_RESUME_PROMPT`     | Convert Markdown to structured JSON (includes custom sections) |
| `EXTRACT_KEYWORDS_PROMPT` | Extract requirements from JD                                   |
| `IMPROVE_RESUME_PROMPT`   | Generate tailored resume (preserves custom sections)           |
| `COVER_LETTER_PROMPT`     | Generate brief cover letter (100-150 words)                    |
| `OUTREACH_MESSAGE_PROMPT` | Generate LinkedIn/email outreach message                       |
| `RESUME_SCHEMA_EXAMPLE`   | JSON schema example with custom sections                       |

**Prompt Design Guidelines:**

1. **Keep prompts simple**: Avoid complex escaping like `{{` - use single `{variable}` for substitution
2. **Be direct**: Start with "Parse this..." or "Extract..." rather than lengthy preambles
3. **Include schema examples**: Show the expected JSON structure in the prompt
4. **Explicit output format**: End with "Output ONLY the JSON object, no other text"

**Example prompt structure:**

```python
PARSE_RESUME_PROMPT = """Parse this resume into JSON. Output ONLY the JSON object, no other text.

Example output format:
{schema}

Rules:
- Use "" for missing text fields, [] for missing arrays
- Number IDs starting from 1

Resume to parse:
{resume_text}"""
```

## Configuration

### Environment Variables

```bash
# Required for cloud providers
LLM_PROVIDER=openai          # openai|anthropic|openrouter|gemini|deepseek|ollama
LLM_MODEL=gpt-4o-mini        # Model identifier
LLM_API_KEY=sk-...           # API key (not needed for Ollama)

# Optional
LLM_API_BASE=http://ollama:11434  # For Ollama or custom endpoints
HOST=0.0.0.0
PORT=8000
```

### Runtime Configuration

Users can update LLM config via API without restarting:

```bash
curl -X PUT http://localhost:8000/api/v1/config/llm-api-key \
  -H "Content-Type: application/json" \
  -d '{"provider": "anthropic", "model": "claude-3-5-sonnet", "api_key": "sk-ant-..."}'
```

Config is stored in `data/config.json` and takes precedence over env vars.

## Development

### Running Locally

```bash
cd apps/backend

# Install dependencies
uv pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env with your API key

# Run with auto-reload
uv run uvicorn app.main:app --reload --port 8000

# Or directly
uv run python -m app.main
```

### Adding a New Endpoint

1. Create/update router in `app/routers/`
2. Add Pydantic models to `app/schemas/models.py`
3. Export in `app/schemas/__init__.py`
4. Register router in `app/main.py`

### Adding a New LLM Provider

LiteLLM handles most providers automatically. For custom providers:

1. Update `get_model_name()` in `app/llm.py`
2. Add env var mapping in `setup_llm_environment()`
3. Update `LLM_PROVIDER` literal in `app/config.py`

## Dependencies

The backend uses minimal dependencies (9 packages):

```
fastapi         - Web framework
uvicorn         - ASGI server
python-multipart - File uploads
pydantic        - Data validation
pydantic-settings - Config management
tinydb          - JSON database
litellm         - Multi-provider LLM
markitdown      - Document conversion
python-dotenv   - Env file loading
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "detail": "Error message here"
}
```

| Status | Meaning                                    |
| ------ | ------------------------------------------ |
| 400    | Bad request (validation error)             |
| 404    | Resource not found                         |
| 413    | File too large                             |
| 422    | Unprocessable (parsing failed)             |
| 500    | Server error (LLM failure)                 |
| 503    | Service unavailable (PDF rendering failed) |

### Error Handling Best Practices

**Security Rule**: Never expose raw exception messages to clients. Log detailed errors server-side for debugging, return generic messages to users.

```python
# CORRECT - Generic message to client, detailed log server-side
except Exception as e:
    logger.error(f"Resume improvement failed: {e}")
    raise HTTPException(
        status_code=500,
        detail="Failed to improve resume. Please try again.",
    )

# WRONG - Exposes internal details (CWE-209)
except Exception as e:
    raise HTTPException(
        status_code=500,
        detail=f"Failed to improve resume: {str(e)}",  # Don't do this!
    )
```

### PDF Rendering Errors

The PDF endpoints (`/resumes/{id}/pdf` and `/resumes/{id}/cover-letter/pdf`) return a 503 status with a helpful error message when PDF generation fails.

**Common cause:** `FRONTEND_BASE_URL` mismatch

If the frontend is running on a different port than configured:

```
Cannot connect to frontend for PDF generation. Attempted URL: http://localhost:3000/...
Please ensure: 1) The frontend is running, 2) The FRONTEND_BASE_URL environment variable
in the backend .env file matches the URL where your frontend is accessible.
```

**Fix:** Update your backend `.env` file:

```env
FRONTEND_BASE_URL=http://localhost:3001  # Match your frontend port
CORS_ORIGINS=["http://localhost:3001", "http://127.0.0.1:3001"]
```
