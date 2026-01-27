# Backend Architecture

> FastAPI + Python 3.11+ | TinyDB | LiteLLM multi-provider

## Directory Structure

```
apps/backend/app/
├── main.py              # FastAPI entry point
├── config.py            # Pydantic settings
├── database.py          # TinyDB wrapper
├── llm.py               # LiteLLM multi-provider
├── pdf.py               # Playwright PDF rendering
├── routers/             # API endpoints (health, config, resumes, jobs)
├── services/            # parser.py, improver.py, cover_letter.py
├── schemas/models.py    # Pydantic models
└── prompts/templates.py # LLM prompts
```

## API Endpoints

### Health & Status
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | LLM health check |
| GET | `/api/v1/status` | Full system status |

### Configuration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PUT | `/api/v1/config/llm-api-key` | LLM config |
| POST | `/api/v1/config/llm-test` | Test connection |

### Resumes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/resumes/upload` | Upload PDF/DOCX |
| GET | `/resumes?resume_id=` | Fetch resume |
| GET | `/resumes/list` | List all |
| POST | `/resumes/improve` | Tailor for job (LLM) |
| PATCH | `/resumes/{id}` | Update |
| GET | `/resumes/{id}/pdf` | Download PDF |
| DELETE | `/resumes/{id}` | Delete |

### Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/jobs/upload` | Store job description |
| GET | `/jobs/{id}` | Fetch job |

## Database (`database.py`)

TinyDB tables: `resumes`, `jobs`, `improvements`

```python
db.create_resume(content, content_type, filename, is_master, processed_data)
db.get_resume(resume_id) → dict | None
db.update_resume(resume_id, updates)
db.delete_resume(resume_id) → bool
db.set_master_resume(resume_id)  # Only one master allowed
db.get_stats() → {total_resumes, total_jobs, total_improvements}
```

## LLM Integration (`llm.py`)

**Providers:** OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Ollama

```python
await check_llm_health(config)     # 30s timeout
await complete(prompt, ...)        # 120s timeout
await complete_json(prompt, ...)   # 180s timeout, JSON mode + retries
```

**Key Features:**
- API keys passed directly (avoids os.environ race conditions)
- Auto JSON mode for supported providers
- 2 retries with lower temperature
- Bracket-matching JSON extraction

## Services

### Parser (`services/parser.py`)
```python
await parse_document(content, filename) → str  # PDF/DOCX → Markdown
await parse_resume_to_json(markdown) → dict    # LLM call
```

### Improver (`services/improver.py`)
```python
await extract_job_keywords(job_desc) → dict    # LLM call
await improve_resume(original, job, keywords)  # LLM call
```

### Cover Letter (`services/cover_letter.py`)
```python
await generate_cover_letter(resume, job) → str    # LLM call
await generate_outreach_message(resume, job) → str # LLM call
```

## PDF Rendering (`pdf.py`)

Uses Playwright headless Chromium:

```python
await render_resume_pdf(url, page_size, selector=".resume-print")
```

**Critical:** CSS must whitelist print classes in `globals.css`:
```css
@media print {
  body * { visibility: hidden !important; }
  .resume-print, .resume-print * { visibility: visible !important; }
}
```

## Configuration

```bash
LLM_PROVIDER=openai|anthropic|gemini|deepseek|openrouter|ollama
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-...
FRONTEND_BASE_URL=http://localhost:3000
```

Config stored in `data/config.json`, takes precedence over env vars.

## Error Handling

Log detailed errors server-side, return generic messages to clients:
```python
except Exception as e:
    logger.error(f"Failed: {e}")
    raise HTTPException(500, "Operation failed. Please try again.")
```
