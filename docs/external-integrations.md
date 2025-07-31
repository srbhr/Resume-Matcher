# External Integrations and Dependencies

## AI Processing

### Ollama Integration (Primary)
```python
# From apps/backend/app/agent/manager.py
class AgentManager:
    def __init__(self, strategy: str | None = None, model: str = "gemma3:4b"):
        # Default model: gemma3:4b
        # Embedding model: nomic-embed-text:137m-v1.5-fp16

class OllamaProvider:
    """Ollama AI provider for local inference"""
    
    def __init__(self, model_name: str = "gemma3:4b"):
        self.model_name = model_name
    
    async def generate(self, prompt: str, **kwargs):
        # Generate text using local Ollama API
        pass
```

### OpenAI Integration (Fallback)
```python
# From apps/backend/app/agent/providers/openai.py
class OpenAIProvider:
    """OpenAI provider for fallback AI operations"""
    
    def __init__(self, api_key: str):
        self.client = openai.AsyncOpenAI(api_key=api_key)
```

## Document Processing

### MarkItDown Integration
```python
# Document parsing implementation
from markitdown import MarkItDown

def parse_resume(file_path: str) -> str:
    """Extract structured text from PDF/DOCX resumes"""
    markitdown = MarkItDown()
    result = markitdown.convert(file_path)
    return result.text_content
```

## Database Integration

### SQLAlchemy + SQLite
```python
# From apps/backend/app/core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

async def init_db():
    """Initialize database connection"""
    engine = create_async_engine(
        "sqlite+aiosqlite:///./resume_matcher.db",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine

async def get_session() -> AsyncSession:
    """Get database session"""
    async with AsyncSessionLocal() as session:
        yield session
```

### Database Migration Strategy
```python
class DatabaseMigration:
    """Handles database schema migrations"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.current_version = "1.0.0"
        self.migrations = {
            "0.0.0:1.0.0": self._migrate_0_to_1,
        }
```
