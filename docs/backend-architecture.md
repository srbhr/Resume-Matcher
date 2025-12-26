# Backend Architecture Documentation

> **Last Updated:** December 27, 2024
> **Purpose:** Complete map of backend components, functions, data flows, and extension points for i18n and feature additions.

---

## 1. Directory Structure

```
apps/backend/
├── app/
│   ├── __init__.py                 # Version: "2.0.0"
│   ├── main.py                     # FastAPI app entry point
│   ├── config.py                   # Settings via pydantic-settings
│   ├── database.py                 # TinyDB wrapper class
│   ├── llm.py                      # LiteLLM multi-provider abstraction
│   ├── pdf.py                      # Playwright PDF rendering
│   ├── routers/
│   │   ├── __init__.py             # Router exports
│   │   ├── health.py               # GET /health, GET /status
│   │   ├── config.py               # GET/PUT /config/llm-api-key, POST /config/llm-test
│   │   ├── resumes.py              # Resume CRUD + improve + PDF
│   │   └── jobs.py                 # Job description upload
│   ├── schemas/
│   │   ├── __init__.py             # Schema exports
│   │   └── models.py               # All Pydantic request/response models
│   ├── services/
│   │   ├── __init__.py             # Service exports
│   │   ├── parser.py               # Document parsing (PDF/DOCX → Markdown → JSON)
│   │   ├── improver.py             # Resume tailoring via LLM
│   │   └── cover_letter.py         # Cover letter & outreach message generation
│   └── prompts/
│       ├── __init__.py             # Prompt exports
│       └── templates.py            # LLM prompt templates
├── data/
│   ├── database.json               # TinyDB storage file
│   └── config.json                 # Runtime LLM configuration
├── pyproject.toml                  # Dependencies & project config
└── .env                            # Environment variables
```

---

## 2. API Endpoints Reference

### 2.1 Health & Status (`routers/health.py`)

| Method | Endpoint | Handler | Description | LLM Call? | DB Call? |
|--------|----------|---------|-------------|-----------|----------|
| GET | `/api/v1/health` | `health_check()` | Basic health with LLM status | **YES** (`check_llm_health()`) | No |
| GET | `/api/v1/status` | `get_status()` | Full system status | **YES** (`check_llm_health()`) | **YES** (`db.get_stats()`) |

**Function Flow:**
```
health_check()
├── check_llm_health() → LLM test call (30s timeout)
└── Return HealthResponse

get_status()
├── get_llm_config() → Load from settings/config.json
├── check_llm_health(config) → LLM test call
├── db.get_stats() → Count resumes/jobs/improvements
└── Return StatusResponse
```

### 2.2 Configuration (`routers/config.py`)

| Method | Endpoint | Handler | Description | LLM Call? | DB Call? |
|--------|----------|---------|-------------|-----------|----------|
| GET | `/api/v1/config/llm-api-key` | `get_llm_config_endpoint()` | Get current config (key masked) | No | No |
| PUT | `/api/v1/config/llm-api-key` | `update_llm_config()` | Update LLM settings | **YES** (validation) | No |
| POST | `/api/v1/config/llm-test` | `test_llm_connection()` | Test LLM connectivity | **YES** | No |

**Function Flow:**
```
get_llm_config_endpoint()
├── _load_config() → Read data/config.json
├── _mask_api_key() → "sk-...xxxx" format
└── Return LLMConfigResponse

update_llm_config(request: LLMConfigRequest)
├── _load_config() → Read existing
├── Merge request fields
├── Build LLMConfig object
├── check_llm_health(config) → Validate via test call
├── _save_config() → Write data/config.json
└── Return LLMConfigResponse

test_llm_connection()
├── _load_config()
├── Build LLMConfig
├── check_llm_health(config)
└── Return health result dict
```

### 2.3 Resumes (`routers/resumes.py`)

| Method | Endpoint | Handler | Description | LLM Call? | DB Call? |
|--------|----------|---------|-------------|-----------|----------|
| POST | `/api/v1/resumes/upload` | `upload_resume()` | Upload PDF/DOCX | **YES** (parsing) | **YES** (create) |
| GET | `/api/v1/resumes` | `get_resume()` | Fetch resume by ID | No | **YES** (read) |
| GET | `/api/v1/resumes/list` | `list_resumes()` | List all resumes | No | **YES** (list) |
| POST | `/api/v1/resumes/improve` | `improve_resume_endpoint()` | Tailor resume for job | **YES** (2-4 calls) | **YES** (create) |
| PATCH | `/api/v1/resumes/{id}` | `update_resume_endpoint()` | Update resume data | No | **YES** (update) |
| GET | `/api/v1/resumes/{id}/pdf` | `download_resume_pdf()` | Generate PDF | No (uses frontend) | **YES** (read) |
| DELETE | `/api/v1/resumes/{id}` | `delete_resume()` | Delete resume | No | **YES** (delete) |
| PATCH | `/api/v1/resumes/{id}/cover-letter` | `update_cover_letter()` | Update cover letter | No | **YES** (update) |
| PATCH | `/api/v1/resumes/{id}/outreach-message` | `update_outreach_message()` | Update outreach message | No | **YES** (update) |
| GET | `/api/v1/resumes/{id}/cover-letter/pdf` | `download_cover_letter_pdf()` | Generate cover letter PDF | No (uses frontend) | **YES** (read) |

**Function Flow - Upload:**
```
upload_resume(file: UploadFile)
├── Validate file type (PDF/DOCX/DOC) and size (≤4MB)
├── parse_document(content, filename) → Markdown string
├── Check if first resume → is_master=True
├── db.create_resume(..., processing_status="processing")
├── parse_resume_to_json(markdown) → LLM call for structured JSON
│   ├── Success: db.update_resume(processed_data, status="ready")
│   └── Failure: db.update_resume(status="failed")
└── Return ResumeUploadResponse{message, request_id, resume_id}
```

**Function Flow - Improve:**
```
improve_resume_endpoint(request: ImproveResumeRequest)
├── db.get_resume(resume_id) → Fetch original
├── db.get_job(job_id) → Fetch job description
├── _load_feature_config() → Load cover letter/outreach toggles
├── extract_job_keywords(job_content) → LLM call #1
│   └── Returns {required_skills, preferred_skills, keywords, ...}
├── improve_resume(original, job_desc, keywords) → LLM call #2
│   └── Returns improved ResumeData JSON
├── generate_improvements(keywords) → Build suggestions (no LLM)
├── [If enable_cover_letter] generate_cover_letter() → LLM call #3
├── [If enable_outreach_message] generate_outreach_message() → LLM call #4
│   └── Uses asyncio.gather() for parallel generation
├── db.create_resume(improved, cover_letter, outreach_message, ...)
├── db.create_improvement(original_id, tailored_id, job_id, improvements)
└── Return ImproveResumeResponse{request_id, data, cover_letter, outreach_message}
```

**Function Flow - Cover Letter PDF:**
```
download_cover_letter_pdf(resume_id, pageSize)
├── db.get_resume(resume_id)
├── Check cover_letter field exists (404 if not)
├── Build URL: {frontend_base_url}/print/cover-letter/{id}?pageSize={pageSize}
├── render_resume_pdf(url, pageSize, selector=".cover-letter-print")
│   └── Playwright renders HTML to PDF
└── Return Response(content=pdf_bytes, media_type="application/pdf")
```

**Note:** The `selector` parameter in `render_resume_pdf()` is critical. For cover letters, it must be `.cover-letter-print` to match the CSS class in the print route.

**Function Flow - PDF:**
```
download_resume_pdf(resume_id, template, pageSize, margins, spacing, fontSize, ...)
├── db.get_resume(resume_id)
├── Build URL: {frontend_base_url}/print/resumes/{id}?{params}
├── render_resume_pdf(url, pageSize) → Playwright renders HTML to PDF
└── Return Response(content=pdf_bytes, media_type="application/pdf")
```

### 2.4 Jobs (`routers/jobs.py`)

| Method | Endpoint | Handler | Description | LLM Call? | DB Call? |
|--------|----------|---------|-------------|-----------|----------|
| POST | `/api/v1/jobs/upload` | `upload_job_descriptions()` | Store job descriptions | No | **YES** (create) |
| GET | `/api/v1/jobs/{id}` | `get_job()` | Fetch job by ID | No | **YES** (read) |

**Function Flow:**
```
upload_job_descriptions(request: JobUploadRequest)
├── For each description in request.job_descriptions:
│   ├── Validate non-empty
│   └── db.create_job(content, resume_id) → Returns {job_id}
└── Return JobUploadResponse{message, job_id[], request}
```

---

## 3. Database Operations (`database.py`)

**Storage:** TinyDB (JSON file at `data/database.json`)

### 3.1 Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `resumes` | All resumes (master & tailored) | resume_id, content, processed_data, is_master, parent_id |
| `jobs` | Job descriptions | job_id, content, resume_id |
| `improvements` | Tailoring records | request_id, original_resume_id, tailored_resume_id, improvements[] |

### 3.2 Resume Operations

```python
# CREATE - Returns full document with generated resume_id
db.create_resume(
    content: str,                    # Markdown or JSON string
    content_type: str = "md",        # "md" | "json"
    filename: str | None = None,     # Original filename
    is_master: bool = False,         # Only one master allowed
    parent_id: str | None = None,    # For tailored resumes
    processed_data: dict | None,     # Structured ResumeData
    processing_status: str = "pending"  # pending→processing→ready|failed
) → dict

# READ
db.get_resume(resume_id: str) → dict | None
db.get_master_resume() → dict | None
db.list_resumes() → list[dict]

# UPDATE
db.update_resume(resume_id: str, updates: dict) → dict | None
db.set_master_resume(resume_id: str) → bool  # Unsets previous master

# DELETE
db.delete_resume(resume_id: str) → bool
```

### 3.3 Job Operations

```python
db.create_job(
    content: str,                    # Raw job description text
    resume_id: str | None = None     # Optional link to resume
) → dict

db.get_job(job_id: str) → dict | None
```

### 3.4 Improvement Operations

```python
db.create_improvement(
    original_resume_id: str,
    tailored_resume_id: str,
    job_id: str,
    improvements: list[dict]         # [{suggestion, lineNumber}, ...]
) → dict
```

### 3.5 Statistics

```python
db.get_stats() → {
    "total_resumes": int,
    "total_jobs": int,
    "total_improvements": int,
    "has_master_resume": bool
}
```

### 3.6 Document Schemas

**Resume Document:**
```json
{
  "resume_id": "uuid-string",
  "content": "markdown or json string",
  "content_type": "md | json",
  "filename": "original_file.pdf",
  "is_master": true | false,
  "parent_id": "uuid or null",
  "processed_data": {
    "personalInfo": {"name", "title", "email", "phone", "location", "website", "linkedin", "github"},
    "summary": "string",
    "workExperience": [{"id", "title", "company", "location", "years", "description": []}],
    "education": [{"id", "institution", "degree", "years", "description"}],
    "personalProjects": [{"id", "name", "role", "years", "description": []}],
    "additional": {"technicalSkills": [], "languages": [], "certificationsTraining": [], "awards": []}
  },
  "processing_status": "pending | processing | ready | failed",
  "cover_letter": "string or null",          // Generated cover letter text (tailored resumes only)
  "outreach_message": "string or null",      // Generated outreach message (tailored resumes only)
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

---

## 4. LLM Operations (`llm.py`)

### 4.1 Supported Providers

| Provider | Prefix | API Key Env Var | Notes |
|----------|--------|-----------------|-------|
| openai | *(none)* | `OPENAI_API_KEY` | GPT models, supports JSON mode |
| anthropic | `anthropic/` | `ANTHROPIC_API_KEY` | Claude models, supports JSON mode |
| openrouter | `openrouter/` | `OPENROUTER_API_KEY` | Multi-model gateway |
| gemini | `gemini/` | `GEMINI_API_KEY` | Google models, supports JSON mode |
| deepseek | `deepseek/` | `DEEPSEEK_API_KEY` | DeepSeek models, supports JSON mode |
| ollama | `ollama/` | *(none, uses api_base)* | Local models via `OLLAMA_API_BASE` |

### 4.2 Core Functions

```python
# Configuration
get_llm_config() → LLMConfig  # Load from settings
setup_llm_environment(config) → None  # Set env vars for LiteLLM

# Health Check
check_llm_health(config: LLMConfig | None) → dict
# Makes minimal test call: "Hi" → 5 tokens max
# Timeout: 30 seconds
# Returns: {healthy: bool, provider, model, error?}

# Text Completion
complete(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7
) → str
# Timeout: 120 seconds

# JSON Completion (with retry logic)
complete_json(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
    retries: int = 2
) → dict
# Uses JSON mode when supported (openai, anthropic, gemini, deepseek)
# Falls back to text extraction via _extract_json()
# Timeout: 180 seconds
# Retry: Lowers temperature (0.1 → 0.0), adds JSON instruction
```

### 4.3 JSON Extraction Helper

```python
_extract_json(content: str) → str
# Handles various LLM output formats:
# 1. ```json ... ``` code blocks
# 2. ``` ... ``` generic code blocks
# 3. Raw JSON starting with {
# 4. JSON properties without braces (wraps them)
# Raises ValueError if no JSON found
```

### 4.4 LLM Timeout Constants

```python
LLM_TIMEOUT_HEALTH_CHECK = 30   # seconds
LLM_TIMEOUT_COMPLETION = 120    # seconds
LLM_TIMEOUT_JSON = 180          # seconds (JSON may take longer)
```

---

## 5. Services Layer

### 5.1 Parser Service (`services/parser.py`)

```python
# Document Conversion
async def parse_document(content: bytes, filename: str) → str
# Converts PDF/DOCX to Markdown using markitdown library
# Flow:
#   1. Extract file extension from filename
#   2. Write bytes to temp file
#   3. Use MarkItDown().convert() to extract text
#   4. Return markdown string
# Libraries: markitdown, pdfminer.six, python-docx

# Resume JSON Parsing (LLM)
async def parse_resume_to_json(markdown_text: str) → dict
# Converts markdown resume to structured JSON
# Flow:
#   1. Format PARSE_RESUME_PROMPT with schema example
#   2. Call complete_json() with system_prompt="You are a JSON extraction engine..."
#   3. Validate result against ResumeData schema
#   4. Return as dict
# LLM CALL: YES
```

### 5.2 Cover Letter Service (`services/cover_letter.py`)

```python
# Cover Letter Generation (LLM)
async def generate_cover_letter(
    resume_data: dict,
    job_description: str,
) -> str
# Generates tailored cover letter based on resume and job
# Flow:
#   1. Format COVER_LETTER_PROMPT with job description and resume JSON
#   2. Call complete() with system_prompt="You are a professional career coach..."
#   3. Return plain text cover letter
# LLM CALL: YES
# Returns: Plain text cover letter (300-400 words)

# Outreach Message Generation (LLM)
async def generate_outreach_message(
    resume_data: dict,
    job_description: str,
) -> str
# Generates cold outreach message for LinkedIn/email
# Flow:
#   1. Format OUTREACH_MESSAGE_PROMPT with job description and resume JSON
#   2. Call complete() with system_prompt="You are a professional networking coach."
#   3. Return plain text message
# LLM CALL: YES
# Returns: Plain text message (100-150 words)
```

### 5.3 Improver Service (`services/improver.py`)

```python
# Keyword Extraction (LLM)
async def extract_job_keywords(job_description: str) → dict
# Extracts requirements from job description
# Flow:
#   1. Format EXTRACT_KEYWORDS_PROMPT with job text
#   2. Call complete_json() with system_prompt="You are an expert job description analyzer."
#   3. Return structured keywords
# LLM CALL: YES
# Returns: {required_skills[], preferred_skills[], experience_requirements[],
#           education_requirements[], key_responsibilities[], keywords[]}

# Resume Tailoring (LLM)
async def improve_resume(
    original_resume: str,      # Markdown
    job_description: str,
    job_keywords: dict
) → dict
# Tailors resume content to match job
# Flow:
#   1. Format IMPROVE_RESUME_PROMPT with job, keywords, resume, schema
#   2. Call complete_json() with system_prompt="You are an expert resume editor..."
#   3. Validate against ResumeData schema
#   4. Return as dict
# LLM CALL: YES

# Improvement Suggestions (No LLM)
def generate_improvements(job_keywords: dict) → list[dict]
# Generates human-readable suggestions based on keywords
# Flow:
#   1. Take top 3 required_skills → "Emphasized '{skill}' to match job requirements"
#   2. Take top 2 responsibilities → "Aligned experience with: {responsibility}"
#   3. If empty, add default suggestion
# LLM CALL: NO
# Returns: [{suggestion: str, lineNumber: int | None}, ...]
```

---

## 6. LLM Prompts (`prompts/templates.py`)

### 6.1 PARSE_RESUME_PROMPT

```
Purpose: Convert resume markdown to structured JSON
Variables:
  - {schema}: RESUME_SCHEMA_EXAMPLE (full JSON with example values)
  - {resume_text}: Raw resume in markdown format

Prompt Text:
"Parse this resume into JSON. Output ONLY the JSON object, no other text.

Example output format:
{schema}

Rules:
- Use "" for missing text fields, [] for missing arrays, null for optional fields
- Number IDs starting from 1
- Format years as "YYYY - YYYY" or "YYYY - Present"

Resume to parse:
{resume_text}"
```

### 6.2 EXTRACT_KEYWORDS_PROMPT

```
Purpose: Extract job requirements for resume tailoring
Variables:
  - {job_description}: Raw job posting text

Prompt Text:
"Extract job requirements as JSON. Output ONLY the JSON object, no other text.

Example format:
{{
  "required_skills": ["Python", "AWS"],
  "preferred_skills": ["Kubernetes"],
  "experience_requirements": ["5+ years"],
  "education_requirements": ["Bachelor's in CS"],
  "key_responsibilities": ["Lead team"],
  "keywords": ["microservices", "agile"]
}}

Job description:
{job_description}"
```

### 6.3 IMPROVE_RESUME_PROMPT

```
Purpose: Tailor resume content to match job requirements
Variables:
  - {job_description}: Target job posting
  - {job_keywords}: Extracted keywords (JSON string)
  - {original_resume}: Original resume (markdown)
  - {schema}: RESUME_SCHEMA_EXAMPLE

Prompt Text:
"Tailor this resume for the job. Output ONLY the JSON object, no other text.

Rules:
- Rephrase content to highlight relevant experience
- DO NOT invent new information
- Use action verbs and quantifiable achievements

Job Description:
{job_description}

Keywords to emphasize:
{job_keywords}

Original Resume:
{original_resume}

Output in this JSON format:
{schema}"
```

### 6.4 RESUME_SCHEMA_EXAMPLE

```json
{
  "personalInfo": {
    "name": "John Doe",
    "title": "Software Engineer",
    "email": "john@example.com",
    "phone": "+1-555-0100",
    "location": "San Francisco, CA",
    "website": "https://johndoe.dev",
    "linkedin": "linkedin.com/in/johndoe",
    "github": "github.com/johndoe"
  },
  "summary": "Experienced software engineer with 5+ years...",
  "workExperience": [
    {
      "id": 1,
      "title": "Senior Software Engineer",
      "company": "Tech Corp",
      "location": "San Francisco, CA",
      "years": "2020 - Present",
      "description": [
        "Led development of microservices architecture",
        "Improved system performance by 40%"
      ]
    }
  ],
  "education": [
    {
      "id": 1,
      "institution": "University of California",
      "degree": "B.S. Computer Science",
      "years": "2014 - 2018",
      "description": "Graduated with honors"
    }
  ],
  "personalProjects": [
    {
      "id": 1,
      "name": "Open Source Tool",
      "role": "Creator & Maintainer",
      "years": "2021 - Present",
      "description": [
        "Built CLI tool with 1000+ GitHub stars",
        "Used by 50+ companies worldwide"
      ]
    }
  ],
  "additional": {
    "technicalSkills": ["Python", "JavaScript", "AWS", "Docker"],
    "languages": ["English (Native)", "Spanish (Conversational)"],
    "certificationsTraining": ["AWS Solutions Architect"],
    "awards": ["Employee of the Year 2022"]
  }
}
```

---

## 7. PDF Rendering (`pdf.py`)

### 7.1 Playwright Integration

```python
# Global browser instance (initialized at startup)
_playwright = None
_browser: Browser | None = None

async def init_pdf_renderer() → None
# Called at app startup via lifespan
# Launches headless Chromium browser

async def close_pdf_renderer() → None
# Called at app shutdown
# Closes browser and playwright instance

async def render_resume_pdf(
    url: str,
    page_size: str = "A4",
    selector: str = ".resume-print"  # CSS selector to wait for
) → bytes
# Flow:
#   1. Create new browser page
#   2. Navigate to URL (wait_until="networkidle")
#   3. Wait for selector (default: ".resume-print", or ".cover-letter-print" for cover letters)
#   4. Wait for document.fonts.ready
#   5. Generate PDF with:
#      - format: "A4" or "Letter"
#      - print_background: True
#      - margin: {top: 0, right: 0, bottom: 0, left: 0}  # Margins in HTML
#   6. Close page
#   7. Return PDF bytes

# IMPORTANT: The selector parameter must match the CSS class used in the print page.
# For resumes: selector=".resume-print"
# For cover letters: selector=".cover-letter-print"
```

### 7.2 Critical: CSS Visibility Rules

**WARNING:** The frontend's `globals.css` hides all content in print mode by default:

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

**If a new print class is not whitelisted in CSS, Playwright will generate blank PDFs.**

When adding new printable document types:
1. Create print route with unique class (e.g., `.report-print`)
2. Add class to `globals.css` visibility whitelist
3. Pass correct selector to `render_resume_pdf()`

### 7.3 Print URL Format

**Resume Print URL:**
```
{frontend_base_url}/print/resumes/{resume_id}?
  template=swiss-single|swiss-two-column
  &pageSize=A4|LETTER
  &marginTop=10 (5-25mm)
  &marginBottom=10
  &marginLeft=10
  &marginRight=10
  &sectionSpacing=3 (1-5)
  &itemSpacing=2 (1-5)
  &lineHeight=3 (1-5)
  &fontSize=3 (1-5)
  &headerScale=3 (1-5)
```

**Cover Letter Print URL:**
```
{frontend_base_url}/print/cover-letter/{resume_id}?
  pageSize=A4|LETTER
```

---

## 8. Configuration (`config.py`)

### 8.1 Settings Class

```python
class Settings(BaseSettings):
    # LLM Configuration
    llm_provider: Literal["openai", "anthropic", "openrouter", "gemini", "deepseek", "ollama"] = "openai"
    llm_model: str = "gpt-4o-mini"
    llm_api_key: str = ""
    llm_api_base: str | None = None  # For Ollama

    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    frontend_base_url: str = "http://localhost:3000"

    # CORS Configuration
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Paths
    data_dir: Path = Path(__file__).parent.parent / "data"

    @property
    def db_path(self) → Path:
        return self.data_dir / "database.json"

    @property
    def config_path(self) → Path:
        return self.data_dir / "config.json"
```

### 8.2 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `openai` | LLM provider (openai, anthropic, etc.) |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `LLM_API_KEY` | *(empty)* | API key for provider |
| `LLM_API_BASE` | *(empty)* | Custom API base URL (Ollama) |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8000` | Server port |
| `FRONTEND_BASE_URL` | `http://localhost:3000` | Frontend URL for PDF rendering |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Comma-separated CORS origins |

---

## 9. Extension Points for i18n

### 9.1 Text Locations That Need Translation

| Location | File | Text Type |
|----------|------|-----------|
| LLM Prompts | `prompts/templates.py` | System prompts, instructions |
| Error Messages | `routers/*.py` | HTTPException details |
| Response Messages | `routers/resumes.py` | Success messages |
| Section Labels | `schemas/models.py` | Field names in schema |

### 9.2 Recommended i18n Strategy

1. **Create `i18n/` directory:**
   ```
   app/i18n/
   ├── __init__.py
   ├── locales/
   │   ├── en.json
   │   ├── es.json
   │   └── ...
   └── loader.py
   ```

2. **Modify prompts to accept language parameter:**
   ```python
   # prompts/templates.py
   def get_parse_resume_prompt(lang: str = "en") → str:
       # Load localized version
   ```

3. **Add language header handling:**
   ```python
   # routers/resumes.py
   @router.post("/upload")
   async def upload_resume(
       file: UploadFile,
       accept_language: str = Header("en")
   ):
       lang = parse_language(accept_language)
       ...
   ```

### 9.3 LLM Prompt Localization

For multi-language resume generation:
```python
# Add language instruction to IMPROVE_RESUME_PROMPT
IMPROVE_RESUME_PROMPT_I18N = """
Tailor this resume for the job.
OUTPUT LANGUAGE: {target_language}
...
"""
```

---

## 10. Extension Points for New Features

### 10.1 Adding New LLM Providers

1. Update `llm.py`:
   - Add to `provider_prefixes` dict
   - Add env var mapping in `setup_llm_environment()`
   - Add to `_supports_json_mode()` if applicable

2. Update `config.py`:
   - Add to `llm_provider` Literal type

3. Update frontend:
   - Add to `PROVIDER_INFO` in `lib/api/config.ts`

### 10.2 Adding New Resume Sections

1. Update `schemas/models.py`:
   - Add new section model (e.g., `Volunteer`)
   - Add field to `ResumeData`

2. Update `prompts/templates.py`:
   - Update `RESUME_SCHEMA_EXAMPLE` with new section

3. Update frontend:
   - Add form component
   - Update resume templates

### 10.3 Adding New Export Formats

1. Create new router or add to `resumes.py`:
   ```python
   @router.get("/{resume_id}/export/{format}")
   async def export_resume(resume_id: str, format: str):
       # docx, markdown, txt, etc.
   ```

2. Add export service in `services/`:
   ```python
   # services/exporter.py
   async def export_to_docx(resume_data: dict) → bytes:
       ...
   ```

---

## 11. Dependencies

### 11.1 Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | ≥0.115.0 | Web framework |
| uvicorn | ≥0.34.0 | ASGI server |
| pydantic | ≥2.11.0 | Data validation |
| pydantic-settings | ≥2.8.0 | Settings management |
| tinydb | ≥4.8.0 | JSON database |
| python-multipart | ≥0.0.20 | File upload handling |

### 11.2 AI/ML Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| litellm | ≥1.56.0 | Multi-provider LLM abstraction |

### 11.3 Document Processing

| Package | Version | Purpose |
|---------|---------|---------|
| markitdown | ≥0.1.0 | Document conversion (PDF/DOCX → Markdown) |
| pdfminer.six | ≥20231228 | PDF text extraction |
| python-docx | ≥1.1.0 | DOCX parsing |
| playwright | ≥1.50.0 | PDF generation via headless Chrome |

---

## 12. Application Lifecycle

### 12.1 Startup (`main.py`)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    await init_pdf_renderer()  # Launch Chromium
    yield
    # Shutdown
    await close_pdf_renderer()  # Close Chromium
    db.close()  # Close TinyDB
```

### 12.2 Request Flow

```
Request → FastAPI Router → Handler Function
                              ├── Database Operations (TinyDB)
                              ├── LLM Operations (LiteLLM)
                              ├── Service Layer (Parser/Improver)
                              └── Response
```

---

## 13. Function Reference by Category

### 13.1 Functions That Invoke LLM

| Function | Location | Purpose | Timeout |
|----------|----------|---------|---------|
| `check_llm_health()` | `llm.py` | Health check | 30s |
| `complete()` | `llm.py` | Text completion | 120s |
| `complete_json()` | `llm.py` | JSON completion | 180s |
| `parse_resume_to_json()` | `services/parser.py` | Resume parsing | Uses complete_json |
| `extract_job_keywords()` | `services/improver.py` | Keyword extraction | Uses complete_json |
| `improve_resume()` | `services/improver.py` | Resume tailoring | Uses complete_json |

### 13.2 Functions That Read Database

| Function | Location | Table |
|----------|----------|-------|
| `db.get_resume()` | `database.py` | resumes |
| `db.get_master_resume()` | `database.py` | resumes |
| `db.list_resumes()` | `database.py` | resumes |
| `db.get_job()` | `database.py` | jobs |
| `db.get_stats()` | `database.py` | all tables |

### 13.3 Functions That Write Database

| Function | Location | Table | Operation |
|----------|----------|-------|-----------|
| `db.create_resume()` | `database.py` | resumes | INSERT |
| `db.update_resume()` | `database.py` | resumes | UPDATE |
| `db.delete_resume()` | `database.py` | resumes | DELETE |
| `db.set_master_resume()` | `database.py` | resumes | UPDATE |
| `db.create_job()` | `database.py` | jobs | INSERT |
| `db.create_improvement()` | `database.py` | improvements | INSERT |

### 13.4 Functions That Process Files

| Function | Location | Input | Output |
|----------|----------|-------|--------|
| `parse_document()` | `services/parser.py` | bytes + filename | Markdown string |
| `render_resume_pdf()` | `pdf.py` | URL + page_size | PDF bytes |

---

*This document is part of the Resume Matcher technical documentation. See also: frontend-architecture.md, design-system.md, api-flow-maps.md*
