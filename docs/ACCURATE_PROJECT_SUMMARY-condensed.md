# Resume Matcher - Accurate Project Summary

## Overview
Resume Matcher is an AI-powered application that helps job seekers optimize their resumes for specific job descriptions using local AI processing.

## Technology Stack
- **Backend**: FastAPI with Python 3.12+, uvicorn, SQLAlchemy 2.0.40
- **Frontend**: Next.js 15, React 19, TypeScript 5, Tailwind CSS
- **AI Processing**: Ollama (gemma3:4b), OpenAI fallback, nomic-embed-text embeddings
- **Document Processing**: MarkItDown for PDF/DOCX parsing
- **Package Manager**: uv (backend), npm (frontend)

## Project Structure
```
/
├── apps/
│   ├── backend/          # FastAPI Python backend
│   │   ├── app/          
│   │   │   ├── agent/    # AI provider abstraction
│   │   │   ├── api/      # FastAPI routers
│   │   │   ├── models/   # SQLAlchemy models
│   │   │   ├── schemas/  # JSON/Pydantic schemas
│   │   │   └── services/ # Business logic
│   └── frontend/         # Next.js React frontend
└── docs/                 # Documentation
```

## Core Components

### Backend Services
- **ResumeService**: Handles resume upload, parsing, and structured data extraction
- **JobService**: Processes job descriptions and keyword extraction
- **ScoreImprovementService**: Calculates match scores and generates improvements

### AI Integration
- **AgentManager**: Manages AI providers with strategy pattern implementation
- **OllamaProvider**: Primary provider for local, private AI inference
- **OpenAIProvider**: Fallback provider when local models unavailable

### Database Models
- **Resume/ProcessedResume**: Stores original content and structured data
- **Job/ProcessedJob**: Stores job descriptions and extracted requirements
- **Associations**: Many-to-many mappings between resumes and jobs

### API Endpoints
- Resume upload, retrieval, and improvement
- Job description processing
- Match scoring and analysis

## Privacy Features
- Local AI processing using Ollama
- No data sent to third parties
- Transparent, open-source implementation
