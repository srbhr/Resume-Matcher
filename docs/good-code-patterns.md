# Good Code Patterns for Resume Matcher

## 1. Dependency Injection for Services

```python
# Example: Injecting a matching service into an API endpoint
from fastapi import Depends, APIRouter

router = APIRouter()

def get_matcher():
    # Return an instance of the matching service
    return ResumeMatcherService()

@router.post("/match")
async def match_resumes(job_id: int, matcher=Depends(get_matcher)):
    return await matcher.match(job_id)
```

## 2. Pydantic Models for Data Validation

```python
from pydantic import BaseModel

class Resume(BaseModel):
    name: str
    email: str
    skills: list[str]
    experience: int
```

## 3. Separation of Concerns

```python
# models/resume.py
class ResumeModel(Base):
    # SQLAlchemy ORM model for resumes

# services/matcher.py
class ResumeMatcherService:
    # Business logic for matching resumes

# api/router/resume.py
@router.post("/upload")
async def upload_resume(resume: Resume):
    # API endpoint logic
```

## 4. Async Database Operations

```python
from sqlalchemy.ext.asyncio import AsyncSession

async def get_resume_by_id(session: AsyncSession, resume_id: int):
    result = await session.execute(select(ResumeModel).where(ResumeModel.id == resume_id))
    return result.scalar_one_or_none()
```

## 5. Frontend: Component-Based UI

```javascript
// src/components/ResumeUpload.js
import React from 'react';

export function ResumeUpload({ onUpload }) {
  return (
    <input type="file" accept=".pdf,.docx" onChange={onUpload} />
  );
}
```

## 6. State Management with Context API

```javascript
// src/context/JobContext.js
import { createContext, useReducer } from 'react';

export const JobContext = createContext();

export function JobProvider({ children }) {
  const [state, dispatch] = useReducer(jobReducer, initialState);
  return (
    <JobContext.Provider value={{ state, dispatch }}>
      {children}
    </JobContext.Provider>
  );
}
```

## 7. Testable Functions

```python
# tests/backend/test_matcher.py
def test_resume_matching():
    matcher = ResumeMatcherService()
    result = matcher.match(job_id=1)
    assert result is not None
```

---

> Use clear function/class names, keep logic modular, validate data at boundaries, and