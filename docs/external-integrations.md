# External Integrations and Dependencies

## Overview

Resume Matcher leverages local AI models and external libraries to provide comprehensive resume analysis capabilities. This document details all external integrations based on the actual implementation in `apps/backend/pyproject.toml`, their purposes, configuration requirements, and fallback strategies.

## AI Processing Integrations

### Ollama Integration (Primary)

Ollama serves as our primary AI provider for local, privacy-preserving inference using the implementation in `apps/backend/app/agent/providers/ollama.py`.

#### Current Configuration
```python
# From apps/backend/app/agent/manager.py
class AgentManager:
    def __init__(self, strategy: str | None = None, model: str = "gemma3:4b"):
        # Default model: gemma3:4b
        # Embedding model: nomic-embed-text:137m-v1.5-fp16 (EmbeddingManager)

# From apps/backend/pyproject.toml
dependencies = ["ollama==0.4.7"]
```

#### Implementation Details
```python
# apps/backend/app/agent/providers/ollama.py
class OllamaProvider:
    """Ollama AI provider for local inference"""
    
    def __init__(self, model_name: str = "gemma3:4b"):
        self.model_name = model_name
    
    @staticmethod
    async def get_installed_models():
        """Get list of available Ollama models"""
        # Implementation checks locally installed models
    
    async def generate(self, prompt: str, **kwargs):
        """Generate text using Ollama API"""
        # Actual implementation for text generation

class OllamaEmbeddingProvider:
    """Ollama embedding provider for vector generation"""
    
    def __init__(self, model_name: str = "nomic-embed-text:137m-v1.5-fp16"):
        self.model_name = model_name
    
    async def embed(self, text: str) -> List[float]:
        """Generate embeddings using Ollama"""
        # Implementation for vector embeddings
```

### OpenAI Integration (Fallback)

OpenAI serves as a fallback provider when local models are not available, implemented in `apps/backend/app/agent/providers/openai.py`.

#### Configuration
```python
# From apps/backend/pyproject.toml
dependencies = ["openai==1.75.0"]

# From apps/backend/app/agent/manager.py
async def _get_provider(self, **kwargs):
    api_key = kwargs.get("openai_api_key", os.getenv("OPENAI_API_KEY"))
    if api_key:
        return OpenAIProvider(api_key=api_key)
    # Falls back to Ollama if no API key provided

# apps/backend/app/agent/providers/openai.py
class OpenAIProvider:
    """OpenAI provider for fallback AI operations"""
    
    def __init__(self, api_key: str):
        self.client = openai.AsyncOpenAI(api_key=api_key)
    
    async def generate(self, prompt: str, **kwargs):
        """Generate text using OpenAI API"""

class OpenAIEmbeddingProvider:
    """OpenAI embedding provider for vector generation"""
    
    async def embed(self, text: str) -> List[float]:
        """Generate embeddings using OpenAI API"""
```
                    raise AIProcessingError("Failed to generate valid JSON response")
                
            except httpx.RequestError as e:
                logger.error(f"Ollama request failed on attempt {attempt + 1}: {e}")
                if attempt == self.config.max_retries - 1:
                    raise AIServiceUnavailableError("Ollama service unavailable")
                
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
    
    def _build_system_prompt(self, schema: dict) -> str:
        """
        Builds system prompt with JSON schema constraints
        """
        return f"""You are a professional resume and job description analyzer. 
        You must respond with valid JSON that matches this exact schema:
        
        {json.dumps(schema, indent=2)}
        
        Rules:
        1. Response must be valid JSON only
        2. All required fields must be present
        3. Follow the data types specified in the schema
        4. Extract information accurately from the provided text
        5. If information is not available, use null for optional fields
        6. For arrays, provide empty arrays if no data exists
        """
    
    async def calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculates semantic similarity between two texts using embeddings
        """
        try:
            # Generate embeddings for both texts
            embedding1 = await self._generate_embedding(text1)
            embedding2 = await self._generate_embedding(text2)
            
            # Calculate cosine similarity
            similarity = self._cosine_similarity(embedding1, embedding2)
            
            return max(0.0, min(1.0, similarity))  # Clamp to [0, 1]
            
        except Exception as e:
            logger.error(f"Similarity calculation failed: {e}")
            return 0.0
    
    async def _generate_embedding(self, text: str) -> List[float]:
        """
        Generates embeddings for text using Ollama's embedding endpoint
        """
        try:
            request_data = {
                "model": self.model_name,
                "prompt": text
            }
            
            response = await self.client.post("/api/embeddings", json=request_data)
            response.raise_for_status()
            
            result = response.json()
            return result.get("embedding", [])
            
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise AIProcessingError("Failed to generate text embeddings")

# Example usage in service layer
class ResumeProcessingService:
    def __init__(self, ai_provider: OllamaProvider):
        self.ai_provider = ai_provider
    
    async def extract_resume_data(self, resume_text: str) -> dict:
        """
        Extracts structured data from resume text using Ollama
        """
        prompt = f"""
        Extract structured information from this resume:
        
        {resume_text}
        
        Focus on:
        - Personal information (name, contact details)
        - Work experience with dates and descriptions
        - Skills categorized by type
        - Education background
        - Key achievements and projects
        """
        
        # Use the resume schema for structured extraction
        from schemas.json.structured_resume import RESUME_SCHEMA
        
        return await self.ai_provider.generate_structured_response(prompt, RESUME_SCHEMA)
```

#### Model Selection Guide

```python
# Recommended models based on hardware
MODEL_RECOMMENDATIONS = {
    "high_performance": {
        "model": "llama3.1:8b",
        "min_ram_gb": 16,
        "min_vram_gb": 8,
        "description": "Best accuracy, requires powerful hardware"
    },
    "balanced": {
        "model": "gemma2:4b", 
        "min_ram_gb": 8,
        "min_vram_gb": 4,
        "description": "Good balance of performance and resource usage"
    },
    "lightweight": {
        "model": "gemma2:2b",
        "min_ram_gb": 4,
        "min_vram_gb": 2,
        "description": "Fast inference on modest hardware"
    }
}

async def recommend_model() -> str:
    """
    Recommends best Ollama model based on available system resources
    """
    import psutil
    
    available_ram = psutil.virtual_memory().total / (1024**3)  # GB
    
    if available_ram >= 16:
        return MODEL_RECOMMENDATIONS["high_performance"]["model"]
    elif available_ram >= 8:
        return MODEL_RECOMMENDATIONS["balanced"]["model"]
    else:
        return MODEL_RECOMMENDATIONS["lightweight"]["model"]
```

### OpenAI Integration (Fallback)

Optional integration for users who prefer cloud-based AI processing.

```python
# agent/providers/openai.py
class OpenAIProvider(BaseAIProvider):
    """
    OpenAI provider for cloud-based AI processing
    """
    
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = "gpt-3.5-turbo"
        self.max_tokens = 4000
        self.temperature = 0.1
    
    async def generate_structured_response(self, prompt: str, schema: dict) -> dict:
        """
        Generates structured response using OpenAI with function calling
        """
        # Convert JSON schema to OpenAI function schema
        function_schema = self._convert_to_function_schema(schema)
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a professional resume and job description analyzer."
                    },
                    {
                        "role": "user", 
                        "content": prompt
                    }
                ],
                functions=[function_schema],
                function_call={"name": function_schema["name"]},
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            
            # Extract function call arguments
            function_call = response.choices[0].message.function_call
            if function_call:
                return json.loads(function_call.arguments)
            else:
                raise AIProcessingError("OpenAI did not return structured response")
                
        except Exception as e:
            logger.error(f"OpenAI processing failed: {e}")
            raise AIProcessingError(f"OpenAI processing error: {str(e)}")
    
    def _convert_to_function_schema(self, json_schema: dict) -> dict:
        """
        Converts JSON schema to OpenAI function calling schema
        """
        return {
            "name": "extract_structured_data",
            "description": "Extract structured data from resume or job description",
            "parameters": json_schema
        }

# Configuration and fallback logic
class AIProviderManager:
    def __init__(self):
        self.ollama_provider = None
        self.openai_provider = None
        self.preferred_provider = "ollama"
        
        self._initialize_providers()
    
    def _initialize_providers(self):
        """
        Initialize available AI providers based on configuration
        """
        # Initialize Ollama if available
        try:
            ollama_config = OllamaConfig()
            self.ollama_provider = OllamaProvider(ollama_config)
            logger.info("Ollama provider initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize Ollama: {e}")
        
        # Initialize OpenAI if API key provided
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            try:
                self.openai_provider = OpenAIProvider(openai_key)
                logger.info("OpenAI provider initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize OpenAI: {e}")
    
    async def get_available_provider(self) -> BaseAIProvider:
        """
        Returns the best available AI provider
        """
        # Try preferred provider first
        if self.preferred_provider == "ollama" and self.ollama_provider:
            if await self.ollama_provider.health_check():
                return self.ollama_provider
        
        # Fallback to OpenAI if available
        if self.openai_provider:
            return self.openai_provider
        
        # Last resort: try Ollama anyway
        if self.ollama_provider:
            return self.ollama_provider
        
        raise AIServiceUnavailableError("No AI providers available")
```

## Document Processing Integration

### MarkItDown Library

Primary library for extracting text from PDF and DOCX files.

```python
# services/document_processor.py
import markitdown
from markitdown import MarkItDown
import tempfile
import os
from typing import Union, BinaryIO

class DocumentProcessor:
    """
    Handles document text extraction using MarkItDown
    """
    
    def __init__(self):
        self.md = MarkItDown()
        self.supported_extensions = {'.pdf', '.docx', '.doc', '.txt', '.md'}
        self.max_file_size = 10 * 1024 * 1024  # 10MB
    
    async def extract_text(self, file_content: bytes, filename: str) -> str:
        """
        Extracts text from uploaded file content
        
        Args:
            file_content: Binary content of the uploaded file
            filename: Original filename with extension
            
        Returns:
            Extracted text in markdown format
        """
        # Validate file
        self._validate_file(file_content, filename)
        
        # Create temporary file for processing
        with tempfile.NamedTemporaryFile(
            suffix=self._get_file_extension(filename),
            delete=False
        ) as temp_file:
            temp_file.write(file_content)
            temp_file_path = temp_file.name
        
        try:
            # Extract text using MarkItDown
            result = self.md.convert(temp_file_path)
            
            if not result.text_content:
                raise DocumentProcessingError("No text content extracted from file")
            
            return result.text_content
            
        except Exception as e:
            logger.error(f"Document processing failed for {filename}: {e}")
            raise DocumentProcessingError(f"Failed to extract text: {str(e)}")
        
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass
    
    def _validate_file(self, content: bytes, filename: str):
        """
        Validates uploaded file
        """
        # Check file size
        if len(content) > self.max_file_size:
            raise FileTooLargeError(
                f"File size ({len(content)} bytes) exceeds maximum allowed size ({self.max_file_size} bytes)"
            )
        
        # Check file extension
        extension = self._get_file_extension(filename).lower()
        if extension not in self.supported_extensions:
            raise UnsupportedFileTypeError(
                f"File type {extension} not supported. Supported types: {', '.join(self.supported_extensions)}"
            )
        
        # Check for empty files
        if len(content) == 0:
            raise EmptyFileError("Uploaded file is empty")
    
    def _get_file_extension(self, filename: str) -> str:
        """
        Extracts file extension from filename
        """
        return os.path.splitext(filename)[1].lower()
    
    async def extract_metadata(self, file_content: bytes, filename: str) -> dict:
        """
        Extracts metadata from document
        """
        with tempfile.NamedTemporaryFile(
            suffix=self._get_file_extension(filename),
            delete=False
        ) as temp_file:
            temp_file.write(file_content)
            temp_file_path = temp_file.name
        
        try:
            result = self.md.convert(temp_file_path)
            
            metadata = {
                "filename": filename,
                "file_size": len(file_content),
                "file_type": self._get_file_extension(filename),
                "text_length": len(result.text_content) if result.text_content else 0,
                "extraction_successful": bool(result.text_content)
            }
            
            # Add document-specific metadata if available
            if hasattr(result, 'metadata') and result.metadata:
                metadata.update({
                    "document_metadata": result.metadata
                })
            
            return metadata
            
        except Exception as e:
            logger.error(f"Metadata extraction failed for {filename}: {e}")
            return {
                "filename": filename,
                "file_size": len(file_content),
                "file_type": self._get_file_extension(filename),
                "extraction_successful": False,
                "error": str(e)
            }
        
        finally:
            try:
                os.unlink(temp_file_path)
            except OSError:
                pass

# Custom exceptions for document processing
class DocumentProcessingError(Exception):
    """Base exception for document processing errors"""
    pass

class FileTooLargeError(DocumentProcessingError):
    """Raised when uploaded file exceeds size limit"""
    pass

class UnsupportedFileTypeError(DocumentProcessingError):
    """Raised when file type is not supported"""
    pass

class EmptyFileError(DocumentProcessingError):
    """Raised when uploaded file is empty"""
    pass

# Example usage in API endpoint
async def process_uploaded_resume(file: UploadFile):
    """
    API endpoint helper for processing uploaded resume files
    """
    processor = DocumentProcessor()
    
    try:
        # Read file content
        file_content = await file.read()
        
        # Extract text
        extracted_text = await processor.extract_text(file_content, file.filename)
        
        # Extract metadata for logging/debugging
        metadata = await processor.extract_metadata(file_content, file.filename)
        
        logger.info(f"Successfully processed {file.filename}: {metadata}")
        
        return {
            "text_content": extracted_text,
            "metadata": metadata
        }
        
    except DocumentProcessingError as e:
        logger.error(f"Document processing failed: {e}")
        raise HTTPException(
            status_code=422,
            detail={
                "error": "document_processing_failed",
                "message": str(e),
                "filename": file.filename
            }
        )
```

### Alternative Document Processing (Fallback)

```python
# Fallback document processors for when MarkItDown fails
class FallbackDocumentProcessor:
    """
    Fallback document processing using multiple libraries
    """
    
    def __init__(self):
        self.processors = {
            '.pdf': [self._process_pdf_pypdf2, self._process_pdf_pdfplumber],
            '.docx': [self._process_docx_python_docx, self._process_docx_mammoth],
            '.doc': [self._process_doc_antiword],
            '.txt': [self._process_txt],
            '.md': [self._process_txt]
        }
    
    async def extract_text_fallback(self, file_path: str, file_extension: str) -> str:
        """
        Attempts text extraction using fallback methods
        """
        processors = self.processors.get(file_extension, [])
        
        for processor_func in processors:
            try:
                text = await processor_func(file_path)
                if text and len(text.strip()) > 0:
                    return text
            except Exception as e:
                logger.warning(f"Fallback processor {processor_func.__name__} failed: {e}")
                continue
        
        raise DocumentProcessingError("All fallback processors failed")
    
    async def _process_pdf_pypdf2(self, file_path: str) -> str:
        """PyPDF2 fallback for PDF processing"""
        try:
            import PyPDF2
            text = ""
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
            return text
        except ImportError:
            raise DocumentProcessingError("PyPDF2 not available")
    
    async def _process_pdf_pdfplumber(self, file_path: str) -> str:
        """pdfplumber fallback for PDF processing"""
        try:
            import pdfplumber
            text = ""
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            return text
        except ImportError:
            raise DocumentProcessingError("pdfplumber not available")
    
    async def _process_docx_python_docx(self, file_path: str) -> str:
        """python-docx fallback for DOCX processing"""
        try:
            from docx import Document
            doc = Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
        except ImportError:
            raise DocumentProcessingError("python-docx not available")
```

## Database Integration

### SQLite with SQLAlchemy

Primary database for local data storage.

```python
# core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
import aiosqlite
import os

class DatabaseManager:
    """
    Manages SQLite database connection and session handling
    """
    
    def __init__(self, database_url: str = None):
        # Default to local SQLite database
        if not database_url:
            db_path = os.path.join(os.getcwd(), "data", "resume_matcher.db")
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            database_url = f"sqlite+aiosqlite:///{db_path}"
        
        self.database_url = database_url
        self.engine = None
        self.async_session = None
        
    async def initialize(self):
        """
        Initialize database engine and session factory
        """
        self.engine = create_async_engine(
            self.database_url,
            echo=False,  # Set to True for SQL query logging
            connect_args={
                "check_same_thread": False,  # Required for SQLite
                "timeout": 30,  # Connection timeout
            },
            pool_pre_ping=True,  # Validate connections before use
            pool_recycle=3600,   # Recycle connections every hour
        )
        
        self.async_session = async_sessionmaker(
            self.engine, 
            class_=AsyncSession,
            expire_on_commit=False
        )
        
        # Create tables if they don't exist
        await self.create_tables()
        
        logger.info(f"Database initialized: {self.database_url}")
    
    async def create_tables(self):
        """
        Create all database tables
        """
        from models.base import Base
        
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    
    async def get_session(self) -> AsyncSession:
        """
        Get database session for queries
        """
        if not self.async_session:
            await self.initialize()
        
        return self.async_session()
    
    async def health_check(self) -> bool:
        """
        Check database connectivity
        """
        try:
            async with self.get_session() as session:
                await session.execute(text("SELECT 1"))
                return True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False
    
    async def close(self):
        """
        Close database connections
        """
        if self.engine:
            await self.engine.dispose()

# Database dependency for FastAPI
async def get_database_session():
    """
    FastAPI dependency for getting database session
    """
    db_manager = DatabaseManager()
    async with db_manager.get_session() as session:
        try:
            yield session
        finally:
            await session.close()

# Example usage in service layer
class ResumeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create_resume(self, resume_data: dict) -> Resume:
        """
        Create new resume record
        """
        resume = Resume(**resume_data)
        self.session.add(resume)
        await self.session.commit()
        await self.session.refresh(resume)
        return resume
    
    async def get_resume_by_id(self, resume_id: str) -> Optional[Resume]:
        """
        Get resume by ID with processed data
        """
        query = (
            select(Resume)
            .options(selectinload(Resume.raw_resume_association))
            .where(Resume.resume_id == resume_id)
        )
        
        result = await self.session.execute(query)
        return result.unique().scalar_one_or_none()
```

### Database Migration Strategy

```python
# Migration management for schema changes
class DatabaseMigration:
    """
    Handles database schema migrations
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.current_version = "1.0.0"
        self.migrations = {
            "0.0.0": "1.0.0": self._migrate_0_to_1,
            # Future migrations would be added here
        }
    
    async def get_schema_version(self) -> str:
        """
        Get current database schema version
        """
        try:
            result = await self.session.execute(
                text("SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1")
            )
            row = result.first()
            return row[0] if row else "0.0.0"
        except Exception:
            # Table doesn't exist, assume initial version
            return "0.0.0"
    
    async def apply_migrations(self):
        """
        Apply any pending database migrations
        """
        current_version = await self.get_schema_version()
        
        if current_version == self.current_version:
            logger.info(f"Database schema is up to date: {current_version}")
            return
        
        logger.info(f"Migrating database from {current_version} to {self.current_version}")
        
        # Apply migrations in sequence
        version = current_version
        while version != self.current_version:
            next_version = self._get_next_version(version)
            migration_key = f"{version}:{next_version}"
            
            if migration_key not in self.migrations:
                raise DatabaseMigrationError(f"No migration path from {version} to {next_version}")
            
            migration_func = self.migrations[migration_key]
            await migration_func()
            
            # Record migration
            await self._record_migration(next_version)
            version = next_version
        
        logger.info(f"Database migration completed: {self.current_version}")
    
    async def _migrate_0_to_1(self):
        """
        Initial database setup
        """
        # Create schema version tracking table
        await self.session.execute(text("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        
        # Add any initial data or schema modifications
        await self.session.commit()
```

## Configuration Management

### Environment Variables

```python
# core/config.py
import os
from typing import Optional, List
from pydantic import BaseSettings, Field

class Settings(BaseSettings):
    """
    Application configuration from environment variables
    """
    
    # Application settings
    app_name: str = Field("Resume Matcher", env="APP_NAME")
    app_version: str = Field("1.0.0", env="APP_VERSION")
    debug: bool = Field(False, env="DEBUG")
    
    # API settings
    api_host: str = Field("localhost", env="API_HOST")
    api_port: int = Field(8000, env="API_PORT")
    api_prefix: str = Field("/api/v1", env="API_PREFIX")
    
    # Database settings
    database_url: Optional[str] = Field(None, env="DATABASE_URL")
    database_echo: bool = Field(False, env="DATABASE_ECHO")
    
    # AI provider settings
    preferred_ai_provider: str = Field("ollama", env="PREFERRED_AI_PROVIDER")
    
    # Ollama settings
    ollama_base_url: str = Field("http://localhost:11434", env="OLLAMA_BASE_URL")
    ollama_model: str = Field("gemma2:4b", env="OLLAMA_MODEL")
    ollama_timeout: int = Field(60, env="OLLAMA_TIMEOUT")
    ollama_temperature: float = Field(0.1, env="OLLAMA_TEMPERATURE")
    
    # OpenAI settings (optional)
    openai_api_key: Optional[str] = Field(None, env="OPENAI_API_KEY")
    openai_model: str = Field("gpt-3.5-turbo", env="OPENAI_MODEL")
    
    # File processing settings
    max_file_size_mb: int = Field(10, env="MAX_FILE_SIZE_MB")
    supported_file_types: List[str] = Field(
        [".pdf", ".docx", ".doc"], 
        env="SUPPORTED_FILE_TYPES"
    )
    
    # Processing settings
    max_concurrent_jobs: int = Field(5, env="MAX_CONCURRENT_JOBS")
    processing_timeout: int = Field(300, env="PROCESSING_TIMEOUT")  # 5 minutes
    
    # Logging settings
    log_level: str = Field("INFO", env="LOG_LEVEL")
    log_file: Optional[str] = Field(None, env="LOG_FILE")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Global settings instance
settings = Settings()

# Configuration validation
async def validate_configuration():
    """
    Validates application configuration and external dependencies
    """
    errors = []
    warnings = []
    
    # Check AI provider availability
    if settings.preferred_ai_provider == "ollama":
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{settings.ollama_base_url}/api/tags", timeout=5)
                if response.status_code != 200:
                    errors.append("Ollama service is not available")
        except Exception as e:
            errors.append(f"Cannot connect to Ollama: {e}")
    
    elif settings.preferred_ai_provider == "openai":
        if not settings.openai_api_key:
            errors.append("OpenAI API key is required when using OpenAI provider")
    
    # Check file size limits
    if settings.max_file_size_mb > 50:
        warnings.append("Large file size limit may cause performance issues")
    
    # Check database configuration
    if settings.database_url and not settings.database_url.startswith("sqlite"):
        warnings.append("Non-SQLite databases require additional setup")
    
    # Report validation results
    if errors:
        logger.error("Configuration validation failed:")
        for error in errors:
            logger.error(f"  - {error}")
        raise ConfigurationError("Invalid configuration")
    
    if warnings:
        logger.warning("Configuration warnings:")
        for warning in warnings:
            logger.warning(f"  - {warning}")
    
    logger.info("Configuration validation passed")

class ConfigurationError(Exception):
    """Raised when configuration is invalid"""
    pass
```

### Environment File Template

```bash
# .env.template - Copy to .env and customize

# Application Settings
APP_NAME="Resume Matcher"
APP_VERSION="1.0.0"
DEBUG=false

# API Settings
API_HOST=localhost
API_PORT=8000
API_PREFIX=/api/v1

# Database Settings (optional - defaults to local SQLite)
# DATABASE_URL=sqlite+aiosqlite:///./data/resume_matcher.db
DATABASE_ECHO=false

# AI Provider Settings
PREFERRED_AI_PROVIDER=ollama

# Ollama Settings
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma2:4b
OLLAMA_TIMEOUT=60
OLLAMA_TEMPERATURE=0.1

# OpenAI Settings (optional fallback)
# OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-3.5-turbo

# File Processing Settings
MAX_FILE_SIZE_MB=10
SUPPORTED_FILE_TYPES=.pdf,.docx,.doc

# Processing Settings
MAX_CONCURRENT_JOBS=5
PROCESSING_TIMEOUT=300

# Logging Settings
LOG_LEVEL=INFO
# LOG_FILE=/var/log/resume_matcher.log
```

## Integration Health Monitoring

```python
# monitoring/health_monitor.py
class IntegrationHealthMonitor:
    """
    Monitors health of all external integrations
    """
    
    def __init__(self):
        self.integrations = {
            "ollama": self._check_ollama_health,
            "database": self._check_database_health,
            "document_processor": self._check_document_processor_health
        }
    
    async def check_all_integrations(self) -> dict:
        """
        Checks health of all integrations
        """
        results = {}
        
        for integration_name, check_func in self.integrations.items():
            try:
                start_time = time.time()
                is_healthy = await check_func()
                response_time = time.time() - start_time
                
                results[integration_name] = {
                    "status": "healthy" if is_healthy else "unhealthy",
                    "response_time_ms": round(response_time * 1000, 2),
                    "last_checked": datetime.utcnow().isoformat()
                }
            except Exception as e:
                results[integration_name] = {
                    "status": "error",
                    "error": str(e),
                    "last_checked": datetime.utcnow().isoformat()
                }
        
        return results
    
    async def _check_ollama_health(self) -> bool:
        """Check Ollama service availability"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{settings.ollama_base_url}/api/tags", timeout=5)
                return response.status_code == 200
        except Exception:
            return False
    
    async def _check_database_health(self) -> bool:
        """Check database connectivity"""
        try:
            db_manager = DatabaseManager()
            return await db_manager.health_check()
        except Exception:
            return False
    
    async def _check_document_processor_health(self) -> bool:
        """Check document processing capability"""
        try:
            processor = DocumentProcessor()
            # Test with a simple text file
            test_content = b"Test document content"
            result = await processor.extract_text(test_content, "test.txt")
            return bool(result and len(result) > 0)
        except Exception:
            return False
```

---

This comprehensive documentation of external integrations provides developers with complete understanding of how Resume Matcher connects with external services, handles failures gracefully, and maintains system reliability through proper configuration and monitoring.
