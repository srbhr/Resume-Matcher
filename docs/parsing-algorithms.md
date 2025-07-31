# Resume Parsing and Matching Algorithms

## Overview
Resume Matcher uses AI-powered algorithms to transform unstructured resumes into structured data and calculate job compatibility scores.

## Processing Pipeline

### 1. Document Validation
```python
async def validate_resume_upload(file: UploadFile) -> bool:
    # Check file type (PDF/DOCX)
    # Verify size (<10MB)
    # Ensure file has content
    return True
```

### 2. Text Extraction
Uses MarkItDown library to convert PDF/DOCX to structured text while preserving document organization.

```python
async def extract_text_from_document(file_bytes: bytes, file_type: str) -> str:
    markitdown = MarkItDown()
    with tempfile.NamedTemporaryFile(suffix=get_file_extension(file_type)) as temp_file:
        temp_file.write(file_bytes)
        temp_file.flush()
        result = markitdown.convert(temp_file.name)
        return result.text_content
```

### 3. Structured Data Extraction
Uses Ollama (gemma3:4b) to convert text to standardized JSON:

```python
async def extract_structured_data(resume_text: str) -> dict:
    prompt = create_extraction_prompt(resume_text)
    response = await agent_manager.run(prompt)
    structured_data = validate_schema(response)
    return structured_data
```

### 4. Keyword Extraction
```python
def extract_keywords(text: str) -> List[str]:
    # Remove common stop words
    # Extract n-grams (1-3 words)
    # Filter by frequency and relevance
    # Return normalized keywords
    return keywords
```

### 5. Vector Embedding
Uses nomic-embed-text to create semantic representations of resume and job content.

### 6. Match Scoring
```python
def calculate_match_score(resume_data: dict, job_data: dict) -> dict:
    # Calculate keyword overlap (30%)
    # Compute vector similarity (40%)
    # Assess experience relevance (20%)
    # Evaluate education match (10%)
    return {
        "overall_score": weighted_average,
        "category_scores": {...},
        "matched_keywords": [...],
        "missing_keywords": [...]
    }
```

### 7. Resume Enhancement
AI-generated improvements based on job requirements and missing keywords.
