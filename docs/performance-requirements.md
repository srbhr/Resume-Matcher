# Performance Requirements and Optimization

## Performance Targets

### Response Time
```python
PERFORMANCE_TARGETS = {
    "api_endpoints": {
        "health_check": {"max_response_time_ms": 50},
        "resume_upload": {"max_response_time_ms": 2000},
        "job_upload": {"max_response_time_ms": 1000},
        "match_score": {"max_response_time_ms": 500}
    },
    "ai_processing": {
        "resume_extraction": {"max_time_s": 30, "target_time_s": 15},
        "job_processing": {"max_time_s": 20, "target_time_s": 10},
        "improvement_generation": {"max_time_s": 45, "target_time_s": 25}
    },
    "database_operations": {
        "simple_query": {"max_time_ms": 50},
        "complex_join": {"max_time_ms": 200}
    },
    "file_processing": {
        "pdf_extraction_1mb": {"max_time_s": 5},
        "docx_extraction_1mb": {"max_time_s": 3}
    }
}
```

## Database Optimizations

### Query Performance
```python
# Optimized query with joins and eager loading
query = (
    select(Resume)
    .options(selectinload(Resume.raw_resume_association))
    .where(Resume.resume_id == resume_id)
)

# Index definitions
__table_args__ = (
    Index('idx_resume_id', 'resume_id'),
    Index('idx_created_at', 'created_at'),
)
```

### Connection Pooling
```python
def init_db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///./resume_matcher.db",
        pool_size=20,
        max_overflow=10,
        pool_timeout=30,
        pool_recycle=1800,
    )
```

## API Optimization

### Asynchronous Processing
- All endpoints use FastAPI's async capabilities
- Long-running AI operations are processed asynchronously
- Streaming responses for resume improvement

### Caching
```python
# Response caching for frequently accessed data
@router.get("/resumes/{resume_id}/preview")
@cache(expire=300)  # Cache for 5 minutes
async def get_resume_preview(resume_id: str):
    # Implementation
```

## AI Processing Optimization

### Model Selection
- Use gemma3:4b for balance of quality and speed
- Smaller embedding models (nomic-embed-text:137m) for vectors
- Batched processing when possible

### Prompt Engineering
- Optimized prompts with clear constraints
- JSON schema validation to ensure clean outputs
- Temperature settings optimized for deterministic results
