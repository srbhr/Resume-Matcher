# System Architecture and Design Patterns

## High-Level Architecture

```
Frontend Layer (Next.js)
    ↓
API Gateway Layer (FastAPI)
    ↓
Service Layer
    ↓
AI Processing Layer
    ↓
Data Layer
```

## Design Patterns

### Factory Pattern
```python
# AI provider factory
from app.agent.providers.base import BaseAIProvider
from app.agent.providers.ollama import OllamaProvider
from app.agent.providers.openai import OpenAIProvider

class AIProviderFactory:
    @staticmethod
    def create_provider(provider_type: str, **kwargs) -> BaseAIProvider:
        if provider_type == "ollama":
            return OllamaProvider(model=kwargs.get("model", "gemma3:4b"))
        elif provider_type == "openai":
            return OpenAIProvider(api_key=kwargs.get("api_key"))
        else:
            raise ValueError(f"Unknown provider type: {provider_type}")
```

### Strategy Pattern
```python
# Processing strategies
from typing import Dict, Any

class ProcessingStrategy:
    """Base strategy for AI processing"""
    processing_type: str = "base"
    
class LocalProcessingStrategy(ProcessingStrategy):
    """Strategy for local AI processing (primary)"""
    
    def __init__(self, ollama_provider):
        self.ollama_provider = ollama_provider
        self.processing_type = "local"
    
    async def extract_resume_data(self, text: str) -> Dict[str, Any]:
        """Extracts resume data using local Ollama"""
        return await self.ollama_provider.generate_structured_response(prompt, SCHEMA)
    
class CloudProcessingStrategy(ProcessingStrategy):
    """Strategy for cloud-based AI processing (fallback)"""
    
    def __init__(self, openai_provider):
        self.openai_provider = openai_provider
        self.processing_type = "cloud"
```

### Repository Pattern
```python
class ResumeRepository:
    """Data access layer for resume operations"""
    
    async def get_by_id(self, resume_id: str) -> Resume:
        query = select(Resume).where(Resume.resume_id == resume_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
```

### Observer Pattern
```python
from typing import List, Protocol

class ResumeObserver(Protocol):
    async def on_resume_processed(self, resume_id: str, resume_data: dict): ...

class ResumeService:
    def __init__(self):
        self.observers: List[ResumeObserver] = []
        
    def register_observer(self, observer: ResumeObserver):
        self.observers.append(observer)
        
    async def notify_observers(self, resume_id: str, resume_data: dict):
        for observer in self.observers:
            await observer.on_resume_processed(resume_id, resume_data)
```
