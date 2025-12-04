# Resume Matcher - GitHub Copilot Instructions

## Purpose & Role

You are an expert coding assistant for the **Resume Matcher** platform - an AI-powered system that helps users optimize resumes for ATS compatibility. Your role is to:

- **Generate consistent, high-quality code** following project patterns
- **Maintain architectural integrity** across backend (FastAPI) and frontend (Next.js)
- **Apply domain-specific knowledge** of resume processing and job matching
- **Follow security best practices** for handling sensitive PII data
- **Write maintainable, well-documented code** with proper error handling

## General Guidelines

### Tone & Approach

- **Be precise and actionable** - focus on specific implementation details
- **Prioritize code quality** over speed - emphasize maintainability
- **Use domain terminology** consistently throughout the codebase
- **Always consider security implications** when handling resume/job data

### Core Principles

- **Follow async/await patterns** for all I/O operations
- **Use dependency injection** for database sessions and services
- **Implement proper error handling** with custom exception hierarchies
- **Apply consistent naming conventions** across backend and frontend
- **Write self-documenting code** with clear variable and function names

## Technology Stack & Architecture

### Backend Stack (`apps/backend/`)

- **Language**: Python 3.12+ with type hints
- **Framework**: `FastAPI` with async/await patterns
- **Database**: `SQLite` with `SQLAlchemy` ORM (async sessions)
- **AI Integration**: `Ollama` serving `gemma3:4b` model locally
- **Document Processing**: `MarkItDown` for PDF/DOCX conversion
- **Validation**: `Pydantic` models for request/response schemas

### Frontend Stack (`apps/frontend/`)

- **Language**: TypeScript with strict mode enabled
- **Framework**: `Next.js` 15+ with App Router pattern
- **Styling**: `Tailwind CSS` 4.0 with utility-first approach
- **Components**: `Radix UI` primitives with custom composition
- **State**: React hooks and context (avoid external state management)

### Project Structure

```
apps/backend/app/
├── models/          # SQLAlchemy database models
├── services/        # Business logic layer (service pattern)
├── api/router/      # FastAPI route handlers
├── agent/           # AI agent management and providers
├── prompt/          # AI prompt templates and schemas
├── schemas/         # Pydantic models and JSON schemas
└── core/            # Configuration, database, exceptions

apps/frontend/
├── app/             # Next.js App Router pages and layouts
├── components/      # Reusable UI components
└── lib/             # Utilities, API clients, type definitions
```

## Domain Terminology & Data Models

### Resume Processing Terms

- **Resume Parsing**: Convert PDF/DOCX documents to structured JSON data
- **Structured Resume**: JSON with `personal_data`, `experiences`, `skills`, `education` sections
- **Resume Keywords**: Skills and terms extracted from resume content for matching
- **ATS Compatibility**: Resume's ability to pass Applicant Tracking System filters

### Job Analysis Terms

- **Job Description Processing**: Convert job postings to structured format
- **Structured Job**: JSON with `job_title`, `company_profile`, `key_responsibilities`, `qualifications`
- **Job Keywords**: Requirements and skills extracted from job descriptions
- **Match Score**: Compatibility percentage between resume and job (0-100%)

### Core Data Models

**Raw Data Storage:**

```python
Resume: {id, resume_id, content, content_type, created_at}
Job: {id, job_id, resume_id, content, created_at}
```

**Processed/Structured Data:**

```python
ProcessedResume: {
    resume_id, personal_data, experiences, projects,
    skills, education, extracted_keywords, processed_at
}
ProcessedJob: {
    job_id, job_title, company_profile, qualifications,
    key_responsibilities, extracted_keywords, processed_at
}
```

### JSON Schema Conventions

- **Dates**: Use `YYYY-MM-DD` format consistently
- **Ongoing positions**: Use string `"Present"` for end dates
- **Foreign keys**: Maintain relationships between raw and processed data
- **JSON columns**: Store flexible structured data for complex objects

## Development Workflows

### Adding New Resume Processing Feature

1. **Create Database Model** (`apps/backend/app/models/`)
   - Add new field to `ProcessedResume` model
   - Include proper JSON column type for complex data
   - Add database migration if needed

2. **Update Service Layer** (`apps/backend/app/services/resume_service.py`)
   - Extend `ResumeService` class with new method
   - Use async/await for all database operations
   - Implement proper error handling with custom exceptions

3. **Add API Endpoint** (`apps/backend/app/api/router/v1/resume.py`)
   - Create new route with proper HTTP method
   - Use Pydantic models for request/response validation
   - Include OpenAPI documentation with examples

4. **Frontend Integration** (`apps/frontend/`)
   - Add TypeScript types in `lib/types/`
   - Create API client function in `lib/api/`
   - Build UI components in `components/`
   - Update pages in `app/` directory

### File Processing Workflow

1. **Upload Validation**

   ```python
   # Validate file type and size
   if file.content_type not in ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]:
       raise HTTPException(status_code=400, detail="Unsupported file type")
   ```

2. **Document Processing**

   ```python
   # Use temporary files for security
   with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
       temp_file.write(file_bytes)
       result = self.md.convert(temp_file.name)
       os.unlink(temp_file.name)  # Always clean up
   ```

3. **AI Processing**
   ```python
   # Use AgentManager for structured responses
   agent_manager = AgentManager(model="gemma3:4b")
   structured_data = await agent_manager.generate_structured_response(
       prompt=prompt_template.format(content=content),
       schema=json_schema,
       validation_model=StructuredResumeModel
   )
   ```

### Error Handling Pattern

```python
# Custom exception hierarchy
class ResumeMatcherException(Exception):
    """Base exception for Resume Matcher operations"""
    pass

class ResumeParsingError(ResumeMatcherException):
    """Raised when resume parsing fails"""
    pass

class AIProcessingError(ResumeMatcherException):
    """Raised when AI processing fails"""
    pass

# Usage in service methods
try:
    result = await self.process_resume(content)
except ValidationError as e:
    raise ResumeParsingError(f"Invalid resume structure: {e}")
except Exception as e:
    logger.error(f"Unexpected error: {e}", exc_info=True)
    raise ResumeMatcherException("Processing failed")
```

## Coding Standards & Patterns

### Backend (Python/FastAPI)

- **Always use async/await** for database operations and external API calls
- **Follow service layer pattern**: Controllers → Services → Models
- **Use Pydantic models** for all request/response validation
- **Implement custom exceptions** with proper inheritance hierarchy
- **Use dependency injection** for database sessions (`Depends(get_db_session)`)
- **Add type hints** to all function parameters and return values
- **Write docstrings** for all public methods explaining purpose and parameters

### Frontend (TypeScript/Next.js)

- **Use TypeScript strict mode** with proper interface definitions
- **Implement App Router patterns** with proper layout hierarchy
- **Create custom hooks** for state management and API interactions
- **Follow component composition** patterns with `Radix UI` primitives
- **Use Tailwind CSS** utility classes with component variants
- **Implement error boundaries** and loading states for better UX

### File Processing Patterns

```python
# Always use temporary files for document processing
with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
    temp_file.write(file_bytes)
    # Process file
    os.unlink(temp_file.name)  # Clean up
```

### AI Agent Patterns

```python
# Use AgentManager for AI operations
agent_manager = AgentManager(model="gemma3:4b")
response = await agent_manager.generate_structured_response(
    prompt=prompt_template.format(data),
    schema=json_schema,
    validation_model=PydanticModel
)
```

## API Design Principles

### RESTful Endpoints

- **Use descriptive resource names**: `/api/v1/resumes`, `/api/v1/jobs`
- **Implement proper HTTP status codes** and error responses
- **Use consistent response formats** with proper typing
- **Version APIs** with `/v1/` prefix for future compatibility

### Request/Response Patterns

- **Accept multipart/form-data** for file uploads
- **Return structured JSON** responses with consistent schemas
- **Implement streaming responses** for long-running operations
- **Use proper pagination** for list endpoints

### Error Handling

```python
# Custom exception hierarchy
class ResumeMatcherException(Exception):
    """Base exception for Resume Matcher operations"""
    pass

class ResumeParsingError(ResumeMatcherException):
    """Raised when resume parsing fails"""
    pass

class AIProcessingError(ResumeMatcherException):
    """Raised when AI processing fails"""
    pass

class JobKeywordExtractionError(ResumeMatcherException):
    """Raised when job keyword extraction fails"""
    pass
```

## Testing Conventions

### Backend Testing

- **Use pytest** with async test patterns
- **Mock external dependencies** (Ollama AI, file system operations)
- **Test service layer** logic independently from API endpoints
- **Implement database transaction rollback** for test isolation
- **Use factory patterns** for test data creation

### Frontend Testing

- **Use Jest and React Testing Library** for component testing
- **Test user interactions** and form submissions
- **Mock API calls** and external dependencies
- **Test responsive design** and accessibility features

### Integration Testing

- **Test file upload and processing workflows** end-to-end
- **Verify AI prompt generation** and response parsing
- **Test database relationships** and data consistency
- **Validate API contract compliance**

## Security Considerations

### Data Protection

- **Resume Data**: Contains PII (names, emails, addresses, work history)
- **Sanitization**: Remove or mask sensitive information in logs
- **Storage**: Use secure file handling, avoid storing files permanently
- **Processing**: Process documents in memory when possible, clean up temp files

### Input Validation

- **Validate file types and sizes** for uploads (PDF/DOCX only)
- **Sanitize user inputs** to prevent injection attacks
- **Validate JSON schemas strictly** for AI-generated content
- **Implement rate limiting** for API endpoints

### AI Safety

- **Validate AI model responses** against expected schemas
- **Implement fallback mechanisms** for AI failures
- **Log AI interactions** for debugging without exposing sensitive data
- **Use structured prompts** to prevent prompt injection

## Development Patterns

### Database Operations

```python
# Always use async patterns
async def get_resume_by_id(db: AsyncSession, resume_id: str) -> Optional[Resume]:
    result = await db.execute(select(Resume).where(Resume.resume_id == resume_id))
    return result.scalar_one_or_none()
```

### Component Structure (Frontend)

```typescript
// Use composition patterns with proper typing
interface ResumeAnalysisProps {
  resumeId: string;
  onAnalysisComplete: (score: number) => void;
}

export function ResumeAnalysis({
  resumeId,
  onAnalysisComplete,
}: ResumeAnalysisProps) {
  // Component implementation
}
```

### Environment Configuration

- **Use environment variables** for sensitive configuration
- **Provide defaults** for development environments
- **Document all required environment variables**
- **Separate configuration** for different deployment environments

## AI Integration Guidelines

### Prompt Engineering

- **Use structured prompts** with clear instructions
- **Include examples** in prompts when possible
- **Validate AI responses** against Pydantic models
- **Implement retry logic** for AI failures

### Model Management

- **Use Ollama** for local AI model serving
- **Default to lightweight models** (gemma3:4b) for development
- **Implement model switching** capabilities for different tasks
- **Monitor AI response quality** and processing times

## Performance Considerations

- **Use database indexes** on frequently queried fields
- **Implement async processing** for file operations
- **Cache processed results** when appropriate
- **Use connection pooling** for database operations
- **Implement proper logging** without performance impact

## Deployment & Operations

- **Use environment-specific configuration**
- **Implement health check endpoints**
- **Use structured logging** for debugging
- **Monitor AI model performance** and availability
- **Implement graceful error handling** and recovery
