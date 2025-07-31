# Business Requirements - Resume Matcher

## Overview
Resume Matcher helps job seekers optimize resumes for ATS systems that filter 75% of applications before human review. Our platform uses local AI processing to analyze, score, and improve resumes.

## Value Proposition
- **Local Processing**: Uses Ollama for private, on-device analysis
- **ATS Simulation**: Reverse-engineers hiring algorithms
- **AI Enhancement**: Provides specific improvements using gemma3:4b
- **Open Source**: Transparent algorithms using FastAPI and Next.js

## Target Users
- **Primary**: Professionals (25-45) seeking new opportunities
- **Secondary**: Career coaches and university career centers
- **Tertiary**: HR professionals auditing their ATS systems

## Core Features

### Resume Upload & Analysis
- Parse PDF/Word resumes and extract structured data
- Provide ATS compatibility score (0-100)
- Processing time < 30 seconds

### Job Description Matching
```
Overall Match Score: 73/100

Strong Matches:
✅ Python programming
✅ Machine Learning
✅ AWS experience

Missing Keywords:
❌ Docker containerization
❌ Kubernetes orchestration
```

### AI-Powered Resume Improvement
- Generate enhanced resume versions tailored for specific jobs
- Show before/after comparisons with explanations
- Provide keyword optimization suggestions

### Performance Requirements
- Support up to 1,000 daily active users
- <2 second response time for API endpoints
- <30 seconds for resume parsing and analysis
