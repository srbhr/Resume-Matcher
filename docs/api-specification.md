# API Specification and Endpoints

## Overview

Resume Matcher's REST API provides comprehensive endpoints for resume processing, job description analysis, and AI-powered matching. This document details all API endpoints based on the actual FastAPI implementation with examples, error handling, and integration patterns.

## API Architecture

### Base Configuration
```python
# Actual API configuration from apps/backend/app/base.py
API_BASE_URL = "http://localhost:8000"
API_VERSION = "v1"
FULL_API_URL = f"{API_BASE_URL}/api/{API_VERSION}"

# FastAPI App Configuration
app = FastAPI(
    title="Resume Matcher",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
```

### Middleware Stack
Based on `apps/backend/app/base.py`:
```python
# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session Middleware
app.add_middleware(
    SessionMiddleware, 
    secret_key=settings.SESSION_SECRET_KEY, 
    same_site="lax"
)

# Request ID Middleware for tracking
app.add_middleware(RequestIDMiddleware)
```

## Health Check Endpoints

### GET /health

Basic health check endpoint as implemented in `apps/backend/app/api/router/health.py`.

```http
GET /health HTTP/1.1
Host: localhost:8000
Accept: application/json

Response:
{
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### GET /health/detailed

Comprehensive health check with performance metrics.

```python
@router.get("/health/detailed", response_model=DetailedHealthResponse)
async def detailed_health_check():
    """
    Returns detailed health information including performance metrics
    """
    start_time = time.time()
    
    # Test database connection
    db_status = await test_database_connection()
    
    # Test AI model availability
    ai_status = await test_ai_model_connection()
    
    # Calculate response time
    response_time = time.time() - start_time
    
    return DetailedHealthResponse(
        status="healthy" if all([db_status, ai_status]) else "degraded",
        timestamp=datetime.utcnow(),
        version="1.0.0",
        response_time_ms=round(response_time * 1000, 2),
        services={
            "database": {
                "status": "connected" if db_status else "disconnected",
                "response_time_ms": 15.2
            },
            "ai_processor": {
                "status": "ready" if ai_status else "unavailable", 
                "model": "gemma3:4b",
                "response_time_ms": 45.8
            }
        },
        metrics={
            "total_resumes_processed": await get_resume_count(),
            "total_jobs_processed": await get_job_count(),
            "avg_processing_time_ms": await get_avg_processing_time()
        }
    )

# Example response
{
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0.0",
    "response_time_ms": 65.3,
    "services": {
        "database": {
            "status": "connected",
            "response_time_ms": 15.2
        },
        "ai_processor": {
            "status": "ready",
            "model": "gemma3:4b", 
            "response_time_ms": 45.8
        }
    },
    "metrics": {
        "total_resumes_processed": 156,
        "total_jobs_processed": 89,
        "avg_processing_time_ms": 2340.5
    }
}
```

## Resume Processing Endpoints

### POST /api/v1/resumes/upload

Upload and process a resume file (PDF or DOCX) as implemented in `apps/backend/app/api/router/v1/resume.py`.

```http
POST /api/v1/resumes/upload HTTP/1.1
Host: localhost:8000
Content-Type: multipart/form-data

Request Body:
- file: UploadFile (PDF or DOCX, max 10MB)
- Supported content types: 
  - "application/pdf"
  - "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

Response:
{
    "message": "File example.pdf successfully processed as MD and stored in the DB",
    "request_id": "12345678-1234-1234-1234-123456789012",
    "resume_id": "resume_abc123def456"
}
```

**Implementation Details:**
```python
# From apps/backend/app/api/router/v1/resume.py
@resume_router.post("/upload")
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
):
    # File validation
    allowed_content_types = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    
    # File processing with MarkItDown
    resume_service = ResumeService(db)
    resume_id = await resume_service.convert_and_store_resume(
        file_bytes=file_bytes,
        file_type=file.content_type,
        filename=file.filename,
        content_type="md",
    )
```

**Error Responses:**
- `400 Bad Request`: Invalid file type or empty file
- `422 Unprocessable Entity`: Resume validation failed during AI processing
- `500 Internal Server Error`: Processing error

### GET /api/v1/resumes

Retrieve resume data by resume_id as implemented in `apps/backend/app/api/router/v1/resume.py`.

```http
GET /api/v1/resumes?resume_id=resume_abc123def456 HTTP/1.1
Host: localhost:8000
Accept: application/json

Response:
{
    "request_id": "12345678-1234-1234-1234-123456789012",
    "data": {
        "raw_resume": {
            "resume_id": "resume_abc123def456",
            "content": "# John Smith\n## Experience\n...",
            "content_type": "md",
            "created_at": "2024-01-15T10:30:00Z"
        },
        "processed_resume": {
            "resume_id": "resume_abc123def456",
            "personal_data": {...},
            "experiences": {...},
            "skills": {...},
            "extracted_keywords": {...},
            "processed_at": "2024-01-15T10:31:00Z"
        }
    }
}
```

### POST /api/v1/resumes/improve

Generate improved resume version as implemented in `apps/backend/app/api/router/v1/resume.py`.

```http
POST /api/v1/resumes/improve HTTP/1.1
Host: localhost:8000
Content-Type: application/json

Request Body:
{
    "resume_id": "resume_abc123def456",
    "job_id": "job_xyz789ghi012"
}

Response (Streaming):
{
    "original_score": 65.2,
    "improved_score": 78.9,
    "score_improvement": 13.7,
    "improved_resume_content": "# John Smith\n## Senior Software Engineer\n...",
    "resume_preview": {
        "personal_data": {...},
        "experiences": [...],
        "skills": [...]
    }
}
```
        processing_eta_seconds=30
    )

# Request/Response models
class ResumeUploadResponse(BaseModel):
    resume_id: str = Field(..., description="Unique identifier for the uploaded resume")
    status: str = Field(..., description="Current processing status")
    message: str = Field(..., description="Human-readable status message")
    processing_eta_seconds: int = Field(..., description="Estimated processing time")

# Example response
{
    "resume_id": "resume_abc12345",
    "status": "processing",
    "message": "Resume uploaded successfully. Processing in background.",
    "processing_eta_seconds": 30
}
```

**Usage Example:**
```bash
curl -X POST "http://localhost:8000/api/v1/resumes/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/resume.pdf"
```

### GET /api/v1/resumes/{resume_id}/status

Check the processing status of an uploaded resume.

```python
@router.get("/resumes/{resume_id}/status", response_model=ProcessingStatusResponse)
async def get_resume_status(resume_id: str):
    """
    Returns the current processing status of a resume
    """
    # Check if resume exists
    resume = await resume_service.get_resume_by_id(resume_id)
    if not resume:
        raise HTTPException(
            status_code=404,
            detail=f"Resume with ID {resume_id} not found"
        )
    
    # Check processing status
    processed_resume = await resume_service.get_processed_resume(resume_id)
    
    if processed_resume:
        return ProcessingStatusResponse(
            resume_id=resume_id,
            status="completed",
            progress_percentage=100,
            message="Resume processing completed successfully",
            completed_at=processed_resume.processed_at,
            processing_time_seconds=calculate_processing_time(resume.created_at, processed_resume.processed_at)
        )
    else:
        # Check if processing is in progress
        processing_job = await get_processing_job_status(resume_id)
        
        return ProcessingStatusResponse(
            resume_id=resume_id,
            status=processing_job.status,
            progress_percentage=processing_job.progress,
            message=processing_job.message,
            estimated_completion=processing_job.eta
        )

# Response model
class ProcessingStatusResponse(BaseModel):
    resume_id: str
    status: str = Field(..., description="One of: processing, completed, failed")
    progress_percentage: int = Field(..., ge=0, le=100)
    message: str
    completed_at: Optional[datetime] = None
    processing_time_seconds: Optional[float] = None
    estimated_completion: Optional[datetime] = None
    error_details: Optional[str] = None

# Example responses
# In progress:
{
    "resume_id": "resume_abc12345",
    "status": "processing",
    "progress_percentage": 65,
    "message": "Extracting structured data from resume content...",
    "estimated_completion": "2024-01-15T10:31:00Z"
}

# Completed:
{
    "resume_id": "resume_abc12345", 
    "status": "completed",
    "progress_percentage": 100,
    "message": "Resume processing completed successfully",
    "completed_at": "2024-01-15T10:30:45Z",
    "processing_time_seconds": 28.3
}
```

### GET /api/v1/resumes/{resume_id}

Retrieve processed resume data.

```python
@router.get("/resumes/{resume_id}", response_model=ResumeDetailResponse)
async def get_resume(resume_id: str):
    """
    Returns complete processed resume data
    """
    processed_resume = await resume_service.get_processed_resume_with_details(resume_id)
    
    if not processed_resume:
        raise HTTPException(
            status_code=404,
            detail=f"Processed resume with ID {resume_id} not found"
        )
    
    return ResumeDetailResponse(
        resume_id=resume_id,
        processed_at=processed_resume.processed_at,
        personal_data=processed_resume.personal_data,
        experiences=processed_resume.experiences,
        skills=processed_resume.skills,
        education=processed_resume.education,
        projects=processed_resume.projects,
        achievements=processed_resume.achievements,
        extracted_keywords=processed_resume.extracted_keywords
    )

# Example response
{
    "resume_id": "resume_abc12345",
    "processed_at": "2024-01-15T10:30:45Z",
    "personal_data": {
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane.smith@email.com",
        "phone": "(555) 123-4567",
        "location": {
            "city": "San Francisco",
            "country": "USA"
        }
    },
    "experiences": [
        {
            "jobTitle": "Senior Software Engineer",
            "company": "Tech Corp",
            "location": "San Francisco, CA",
            "startDate": "2021-03-01",
            "endDate": "2023-06-15",
            "description": [
                "Led development of microservices architecture",
                "Mentored team of 5 junior developers"
            ],
            "technologiesUsed": ["Python", "Docker", "AWS"]
        }
    ],
    "skills": [
        {"category": "Programming Languages", "skillName": "Python"},
        {"category": "Cloud", "skillName": "AWS"},
        {"category": "DevOps", "skillName": "Docker"}
    ],
    "extracted_keywords": ["Python", "Senior", "Microservices", "Leadership", "AWS"]
}
```

### GET /api/v1/resumes/{resume_id}/preview

Get resume data formatted for frontend preview.

```python
@router.get("/resumes/{resume_id}/preview", response_model=ResumePreviewModel)
async def get_resume_preview(resume_id: str):
    """
    Returns resume data formatted for frontend display
    """
    processed_resume = await resume_service.get_processed_resume(resume_id)
    
    if not processed_resume:
        raise HTTPException(
            status_code=404,
            detail=f"Resume with ID {resume_id} not found"
        )
    
    # Transform data for frontend consumption
    preview_data = await resume_transformer.to_preview_format(processed_resume)
    
    return preview_data

# Example response
{
    "personalInfo": {
        "name": "Jane Smith",
        "title": "Senior Software Engineer",
        "email": "jane.smith@email.com",
        "phone": "(555) 123-4567",
        "location": "San Francisco, CA"
    },
    "summary": "Experienced software engineer with 8+ years building scalable applications...",
    "experience": [
        {
            "id": 1,
            "title": "Senior Software Engineer",
            "company": "Tech Corp",
            "location": "San Francisco, CA",
            "years": "2021-2023",
            "description": [
                "Led development of microservices architecture",
                "Mentored team of 5 junior developers"
            ]
        }
    ],
    "education": [
        {
            "id": 1,
            "institution": "Stanford University",
            "degree": "MS Computer Science",
            "years": "2015-2017"
        }
    ],
    "skills": ["Python", "JavaScript", "AWS", "Docker", "Leadership"]
}
```

## Job Description Endpoints

### POST /api/v1/jobs/upload

Upload and process job descriptions.

```python
@router.post("/jobs/upload", response_model=JobUploadResponse)
async def upload_job_descriptions(
    request: JobUploadRequest,
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Processes one or more job descriptions
    
    Args:
        request: Contains job descriptions and optional resume_id for immediate matching
    """
    job_ids = []
    
    for job_description in request.job_descriptions:
        # Generate unique ID
        job_id = f"job_{uuid4().hex[:8]}"
        
        # Store raw job description
        await job_service.create_raw_job(
            job_id=job_id,
            content=job_description,
            content_type="text"
        )
        
        # Queue AI processing
        background_tasks.add_task(
            process_job_async,
            job_id=job_id,
            content=job_description
        )
        
        job_ids.append(job_id)
    
    # If resume_id provided, queue matching jobs
    if request.resume_id:
        for job_id in job_ids:
            background_tasks.add_task(
                create_job_resume_association,
                job_id=job_id,
                resume_id=request.resume_id
            )
    
    return JobUploadResponse(
        job_ids=job_ids,
        status="processing",
        message=f"Successfully queued {len(job_ids)} job(s) for processing",
        processing_eta_seconds=15
    )

# Request model
class JobUploadRequest(BaseModel):
    job_descriptions: List[str] = Field(
        ..., 
        description="List of job description texts",
        min_items=1,
        max_items=10
    )
    resume_id: Optional[str] = Field(
        None, 
        description="Optional resume ID to associate jobs with"
    )

# Response model
class JobUploadResponse(BaseModel):
    job_ids: List[str] = Field(..., description="Generated job IDs")
    status: str = Field(..., description="Processing status")
    message: str = Field(..., description="Status message")
    processing_eta_seconds: int = Field(..., description="Estimated processing time")

# Example request
{
    "job_descriptions": [
        "Senior Python Developer needed with 5+ years experience in Django and AWS...",
        "Frontend Engineer position requiring React, TypeScript, and modern web development skills..."
    ],
    "resume_id": "resume_abc12345"
}

# Example response
{
    "job_ids": ["job_xyz78901", "job_def23456"],
    "status": "processing",
    "message": "Successfully queued 2 job(s) for processing",
    "processing_eta_seconds": 15
}
```

### GET /api/v1/jobs/{job_id}

Retrieve processed job description data.

```python
@router.get("/jobs/{job_id}", response_model=JobDetailResponse)
async def get_job(job_id: str):
    """
    Returns complete processed job description data
    """
    processed_job = await job_service.get_processed_job_with_details(job_id)
    
    if not processed_job:
        raise HTTPException(
            status_code=404,
            detail=f"Job with ID {job_id} not found"
        )
    
    return JobDetailResponse(
        job_id=job_id,
        processed_at=processed_job.processed_at,
        job_title=processed_job.job_title,
        company_profile=processed_job.company_profile,
        location=processed_job.location,
        employment_type=processed_job.employment_type,
        job_summary=processed_job.job_summary,
        key_responsibilities=processed_job.key_responsibilities,
        qualifications=processed_job.qualifications,
        compensation_and_benefits=processed_job.compensation_and_benefits,
        extracted_keywords=processed_job.extracted_keywords
    )

# Example response
{
    "job_id": "job_xyz78901",
    "processed_at": "2024-01-15T10:32:15Z",
    "job_title": "Senior Python Developer",
    "company_profile": "Fast-growing fintech startup focused on payment solutions",
    "location": "San Francisco, CA (Remote OK)",
    "employment_type": "Full-time",
    "job_summary": "We're seeking an experienced Python developer to lead backend development...",
    "key_responsibilities": [
        "Design and implement scalable backend services",
        "Lead code reviews and mentor junior developers",
        "Collaborate with product team on feature requirements"
    ],
    "qualifications": {
        "required": [
            "5+ years Python development experience",
            "Experience with Django or Flask",
            "AWS cloud platform knowledge"
        ],
        "preferred": [
            "Experience with Docker and Kubernetes",
            "Financial services background"
        ]
    },
    "compensation_and_benefits": {
        "salary_range": "$120,000 - $160,000",
        "benefits": ["Health insurance", "401k matching", "Remote work"]
    },
    "extracted_keywords": ["Python", "Django", "AWS", "Senior", "Backend", "Leadership"]
}
```

## Resume Improvement Endpoints

### POST /api/v1/resumes/{resume_id}/improve

Generate improved resume version based on job requirements.

```python
@router.post("/resumes/{resume_id}/improve", response_model=ImprovementResult)
async def improve_resume(
    resume_id: str,
    request: ResumeImprovementRequest,
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Generates an improved version of a resume tailored to a specific job
    
    Process:
    1. Validate resume and job exist
    2. Calculate current match score
    3. Use AI to generate improvements
    4. Calculate new match score
    5. Return improved resume with explanations
    """
    # Validate inputs
    resume = await resume_service.get_processed_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    
    job = await job_service.get_processed_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Generate request ID for tracking
    request_id = f"improvement_{uuid4().hex[:8]}"
    
    # Calculate current match score
    current_score = await matching_service.calculate_match_score(resume, job)
    
    # Generate improvements using AI
    improvement_result = await improvement_service.generate_improvements(
        resume=resume,
        job=job,
        request_id=request_id
    )
    
    # Calculate new match score
    new_score = await matching_service.calculate_match_score(
        improvement_result.improved_resume, 
        job
    )
    
    # Create association record
    await create_job_resume_association(request.job_id, resume_id)
    
    return ImprovementResult(
        request_id=request_id,
        resume_id=resume_id,
        job_id=request.job_id,
        original_score=current_score,
        new_score=new_score,
        resume_preview=improvement_result.preview_data,
        details=improvement_result.explanation,
        commentary=improvement_result.ai_commentary,
        improvements=improvement_result.specific_changes
    )

# Request model
class ResumeImprovementRequest(BaseModel):
    job_id: str = Field(..., description="Job ID to optimize resume for")
    focus_areas: Optional[List[str]] = Field(
        None, 
        description="Specific areas to focus on (e.g., 'skills', 'experience')"
    )
    improvement_level: Optional[str] = Field(
        "moderate",
        description="Level of changes: minimal, moderate, aggressive"
    )

# Example request
{
    "job_id": "job_xyz78901",
    "focus_areas": ["skills", "experience"],
    "improvement_level": "moderate"
}

# Example response
{
    "request_id": "improvement_def45678",
    "resume_id": "resume_abc12345",
    "job_id": "job_xyz78901",
    "original_score": 72.5,
    "new_score": 86.3,
    "resume_preview": {
        "personalInfo": {
            "name": "Jane Smith",
            "title": "Senior Python Developer"
        },
        "experience": [
            {
                "id": 1,
                "title": "Senior Software Engineer",
                "company": "Tech Corp",
                "description": [
                    "Led development of scalable Python microservices using Django and AWS Lambda",
                    "Mentored team of 5 junior developers on backend architecture best practices"
                ]
            }
        ],
        "skills": ["Python", "Django", "AWS", "Microservices", "Team Leadership"]
    },
    "details": "Enhanced technical skills alignment and added quantifiable achievements",
    "commentary": "Your resume has been optimized for the Senior Python Developer role by emphasizing your Python/Django experience and AWS cloud skills. The improvements include more specific technology mentions and quantified achievements that align with the job requirements.",
    "improvements": [
        {
            "section": "experience",
            "change": "Added specific technologies (Django, AWS Lambda) to job descriptions",
            "impact": "+5.2 points",
            "reasoning": "Job specifically requires Django and AWS experience"
        },
        {
            "section": "skills",
            "change": "Reordered skills to highlight Python, Django, and AWS",
            "impact": "+4.1 points",
            "reasoning": "These are the top required skills for this position"
        },
        {
            "section": "experience",
            "change": "Added quantifiable metrics to leadership accomplishments",
            "impact": "+4.5 points",
            "reasoning": "Job values leadership experience with measurable impact"
        }
    ]
}
```

### GET /api/v1/resumes/{resume_id}/matches/{job_id}/score

Calculate match score between resume and job without improvements.

```python
@router.get("/resumes/{resume_id}/matches/{job_id}/score", response_model=MatchScoreResponse)
async def get_match_score(resume_id: str, job_id: str):
    """
    Calculates and returns detailed match score between resume and job
    """
    # Validate inputs
    resume = await resume_service.get_processed_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    
    job = await job_service.get_processed_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Calculate detailed match score
    match_analysis = await matching_service.detailed_match_analysis(resume, job)
    
    return MatchScoreResponse(
        resume_id=resume_id,
        job_id=job_id,
        overall_score=match_analysis.overall_score,
        category_scores=match_analysis.category_scores,
        matched_keywords=match_analysis.matched_keywords,
        missing_keywords=match_analysis.missing_keywords,
        analysis_details=match_analysis.detailed_breakdown,
        recommendations=match_analysis.improvement_suggestions
    )

# Response model
class MatchScoreResponse(BaseModel):
    resume_id: str
    job_id: str
    overall_score: float = Field(..., ge=0, le=100, description="Overall match score (0-100)")
    category_scores: dict = Field(..., description="Scores by category")
    matched_keywords: List[str] = Field(..., description="Keywords found in both resume and job")
    missing_keywords: List[str] = Field(..., description="Important job keywords missing from resume")
    analysis_details: dict = Field(..., description="Detailed breakdown of scoring")
    recommendations: List[str] = Field(..., description="Specific improvement recommendations")

# Example response
{
    "resume_id": "resume_abc12345",
    "job_id": "job_xyz78901",
    "overall_score": 72.5,
    "category_scores": {
        "technical_skills": 85.2,
        "experience_level": 78.0,
        "industry_knowledge": 65.5,
        "soft_skills": 70.3,
        "education": 60.0
    },
    "matched_keywords": [
        "Python", "Software Engineer", "Team Lead", "AWS", "Microservices"
    ],
    "missing_keywords": [
        "Django", "Docker", "Kubernetes", "CI/CD", "Financial Services"
    ],
    "analysis_details": {
        "technical_alignment": "Strong match on Python and AWS, missing Django framework experience",
        "experience_match": "5 years experience meets requirement, leadership experience is relevant",
        "education_gap": "Job prefers Computer Science degree, candidate has related field"
    },
    "recommendations": [
        "Add Django framework experience to skills section",
        "Highlight any containerization work (Docker/Kubernetes)",
        "Emphasize any financial technology projects",
        "Quantify team leadership achievements"
    ]
}
```

## Error Handling

### Standard Error Response Format

All API errors follow a consistent format:

```python
class ErrorResponse(BaseModel):
    error: str = Field(..., description="Error type/code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[dict] = Field(None, description="Additional error details")
    timestamp: datetime = Field(..., description="When the error occurred")
    request_id: Optional[str] = Field(None, description="Request tracking ID")

# HTTP Status Code mapping
ERROR_STATUS_CODES = {
    "validation_error": 400,
    "authentication_required": 401,
    "forbidden": 403,
    "not_found": 404,
    "method_not_allowed": 405,
    "conflict": 409,
    "payload_too_large": 413,
    "unsupported_media_type": 415,
    "unprocessable_entity": 422,
    "rate_limit_exceeded": 429,
    "internal_server_error": 500,
    "service_unavailable": 503
}
```

### Common Error Examples

**400 Bad Request - Validation Error:**
```json
{
    "error": "validation_error",
    "message": "Request validation failed",
    "details": {
        "field_errors": [
            {
                "field": "job_descriptions",
                "message": "Field required",
                "type": "missing"
            }
        ]
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_abc123"
}
```

**404 Not Found:**
```json
{
    "error": "not_found",
    "message": "Resume with ID resume_invalid123 not found",
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_def456"
}
```

**413 Payload Too Large:**
```json
{
    "error": "payload_too_large", 
    "message": "File size must be less than 10MB",
    "details": {
        "max_size_mb": 10,
        "uploaded_size_mb": 15.2
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

**422 Unprocessable Entity:**
```json
{
    "error": "unprocessable_entity",
    "message": "Failed to extract text from uploaded file",
    "details": {
        "file_type": "pdf",
        "extraction_error": "File appears to be corrupted or password-protected"
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

**500 Internal Server Error:**
```json
{
    "error": "internal_server_error",
    "message": "An unexpected error occurred while processing your request",
    "details": {
        "error_id": "err_789xyz",
        "support_message": "Please contact support with this error ID"
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### Error Handling in Client Code

```javascript
// Example client-side error handling
class ResumeMatcherAPI {
    async uploadResume(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/api/v1/resumes/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new APIError(errorData);
            }
            
            return await response.json();
            
        } catch (error) {
            if (error instanceof APIError) {
                this.handleAPIError(error);
            } else {
                this.handleNetworkError(error);
            }
            throw error;
        }
    }
    
    handleAPIError(error) {
        switch (error.code) {
            case 'validation_error':
                this.showValidationErrors(error.details.field_errors);
                break;
            case 'payload_too_large':
                this.showError('File is too large. Please choose a smaller file.');
                break;
            case 'unsupported_media_type':
                this.showError('Only PDF and DOCX files are supported.');
                break;
            default:
                this.showError(error.message);
        }
    }
}

class APIError extends Error {
    constructor(errorResponse) {
        super(errorResponse.message);
        this.code = errorResponse.error;
        this.details = errorResponse.details;
        this.timestamp = errorResponse.timestamp;
        this.requestId = errorResponse.request_id;
    }
}
```

## Rate Limiting and Performance

### Rate Limiting

```python
# Rate limiting configuration
RATE_LIMITS = {
    "resume_upload": "5 per minute",
    "job_upload": "10 per minute", 
    "improvement_request": "3 per minute",
    "general_api": "100 per minute"
}

# Rate limit headers in responses
RATE_LIMIT_HEADERS = {
    "X-RateLimit-Limit": "5",
    "X-RateLimit-Remaining": "3",
    "X-RateLimit-Reset": "1705312200"
}
```

### Performance Considerations

- **File Upload**: 10MB max file size, supports PDF and DOCX
- **Processing Time**: Resume processing typically takes 15-30 seconds
- **Concurrent Processing**: Up to 5 simultaneous AI processing jobs
- **Database Queries**: Optimized with proper indexing and eager loading
- **Memory Usage**: Streaming file uploads to minimize memory footprint

---

This comprehensive API specification provides developers with everything needed to integrate with Resume Matcher's backend services, including detailed examples, error handling patterns, and performance considerations.
