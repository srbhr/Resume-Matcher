import os
import uuid
import json
import tempfile
import logging
import asyncio
from typing import Optional, Dict, Any, AsyncGenerator
from contextlib import asynccontextmanager
import aiofiles
from datetime import datetime

from markitdown import MarkItDown
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import ValidationError

from app.models import Resume, ProcessedResume
from app.agent import AgentManager
from app.prompt import prompt_factory
from app.schemas.json import json_schema_factory
from app.schemas.pydantic import StructuredResumeModel
from app.core import cache, cached, settings
from app.core.database import OptimizedQuery

logger = logging.getLogger(__name__)


class ResumeService:
    """
    Production-ready resume processing service with optimizations.
    
    Features:
    - Streaming file processing for memory efficiency
    - Async file operations
    - Result caching
    - Batch processing support
    - Comprehensive error handling
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.md = MarkItDown(enable_plugins=False)
        self.json_agent_manager = AgentManager(model=settings.OLLAMA_MODEL)
        self.chunk_size = settings.UPLOAD_CHUNK_SIZE
        self.max_file_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    
    @asynccontextmanager
    async def _temporary_file(self, suffix: str):
        """Context manager for safe temporary file handling."""
        temp_file = None
        temp_path = None
        try:
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            temp_path = temp_file.name
            yield temp_file, temp_path
        finally:
            if temp_file:
                temp_file.close()
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception as e:
                    logger.warning(f"Failed to remove temp file {temp_path}: {e}")
    
    async def convert_and_store_resume_stream(
        self,
        file_stream: AsyncGenerator[bytes, None],
        file_type: str,
        filename: str,
        content_type: str = "md"
    ) -> str:
        """
        Memory-efficient streaming resume processing.
        
        Args:
            file_stream: Async generator yielding file chunks
            file_type: MIME type of the file
            filename: Original filename
            content_type: Output format ("md" or "html")
            
        Returns:
            resume_id: ID of the stored resume
        """
        # Validate file type
        if not self._validate_file_type(file_type):
            raise ValueError(f"Unsupported file type: {file_type}")
        
        file_extension = self._get_file_extension(file_type)
        
        async with self._temporary_file(file_extension) as (temp_file, temp_path):
            # Stream file to disk with size limit
            total_size = 0
            async with aiofiles.open(temp_path, 'wb') as f:
                async for chunk in file_stream:
                    total_size += len(chunk)
                    if total_size > self.max_file_size:
                        raise ValueError(f"File size exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit")
                    await f.write(chunk)
            
            # Process the file
            return await self._process_resume_file(temp_path, filename, content_type)
    
    async def convert_and_store_resume(
        self,
        file_bytes: bytes,
        file_type: str,
        filename: str,
        content_type: str = "md"
    ) -> str:
        """
        Converts resume file to text and stores it in the database.
        
        Enhanced with:
        - File size validation
        - Error handling
        - Logging
        """
        # Validate file size
        if len(file_bytes) > self.max_file_size:
            raise ValueError(f"File size exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit")
        
        # Validate file type
        if not self._validate_file_type(file_type):
            raise ValueError(f"Unsupported file type: {file_type}")
        
        file_extension = self._get_file_extension(file_type)
        
        async with self._temporary_file(file_extension) as (temp_file, temp_path):
            # Write file asynchronously
            async with aiofiles.open(temp_path, 'wb') as f:
                await f.write(file_bytes)
            
            return await self._process_resume_file(temp_path, filename, content_type)
    
    async def _process_resume_file(
        self,
        file_path: str,
        filename: str,
        content_type: str
    ) -> str:
        """Process resume file and store in database."""
        try:
            # Convert file to text
            start_time = asyncio.get_event_loop().time()
            result = await asyncio.to_thread(self.md.convert, file_path)
            text_content = result.text_content
            
            conversion_time = asyncio.get_event_loop().time() - start_time
            logger.info(f"Resume conversion took {conversion_time:.2f}s for {filename}")
            
            # Store in database
            resume_id = await self._store_resume_in_db(
                text_content,
                content_type,
                metadata={
                    "filename": filename,
                    "conversion_time": conversion_time,
                    "processed_at": datetime.utcnow().isoformat()
                }
            )
            
            # Extract structured data asynchronously
            asyncio.create_task(
                self._extract_and_store_structured_resume(resume_id, text_content)
            )
            
            return resume_id
            
        except Exception as e:
            logger.error(f"Failed to process resume {filename}: {e}")
            raise
    
    def _validate_file_type(self, file_type: str) -> bool:
        """Validate if file type is supported."""
        supported_types = {
            "application/pdf": ".pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
            "text/plain": ".txt"
        }
        return file_type in supported_types
    
    def _get_file_extension(self, file_type: str) -> str:
        """Returns the appropriate file extension based on MIME type."""
        extensions = {
            "application/pdf": ".pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
            "text/plain": ".txt"
        }
        return extensions.get(file_type, "")
    
    async def _store_resume_in_db(
        self,
        text_content: str,
        content_type: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Stores the parsed resume content in the database with metadata.
        """
        resume_id = str(uuid.uuid4())
        resume = Resume(
            resume_id=resume_id,
            content=text_content,
            content_type=content_type,
            metadata=json.dumps(metadata) if metadata else None,
            created_at=datetime.utcnow()
        )
        
        self.db.add(resume)
        await self.db.flush()
        
        # Cache the resume for quick retrieval
        await cache.set(
            f"resume:{resume_id}",
            {
                "content": text_content[:1000],  # Cache preview only
                "content_type": content_type,
                "metadata": metadata
            },
            ttl=3600  # 1 hour cache
        )
        
        return resume_id
    
    @cached(ttl=300, namespace="structured_resume")
    async def _extract_and_store_structured_resume(
        self,
        resume_id: str,
        resume_text: str
    ) -> Optional[Dict[str, Any]]:
        """
        Extract and store structured resume data with caching.
        """
        try:
            # Check if already processed
            existing = await self.db.execute(
                select(ProcessedResume).where(ProcessedResume.resume_id == resume_id)
            )
            if existing.scalar_one_or_none():
                logger.info(f"Resume {resume_id} already processed")
                return None
            
            # Extract structured data
            structured_resume = await self._extract_structured_json(resume_text)
            if not structured_resume:
                logger.warning(f"Structured extraction failed for resume {resume_id}")
                return None
            
            # Prepare data for storage
            processed_data = {
                "personal_data": structured_resume.get("personal_data"),
                "experiences": structured_resume.get("experiences", []),
                "projects": structured_resume.get("projects", []),
                "skills": structured_resume.get("skills", []),
                "research_work": structured_resume.get("research_work", []),
                "achievements": structured_resume.get("achievements", []),
                "education": structured_resume.get("education", []),
                "extracted_keywords": structured_resume.get("extracted_keywords", [])
            }
            
            # Store in database
            processed_resume = ProcessedResume(
                resume_id=resume_id,
                personal_data=json.dumps(processed_data["personal_data"]) if processed_data["personal_data"] else None,
                experiences=json.dumps({"experiences": processed_data["experiences"]}),
                projects=json.dumps({"projects": processed_data["projects"]}),
                skills=json.dumps({"skills": processed_data["skills"]}),
                research_work=json.dumps({"research_work": processed_data["research_work"]}),
                achievements=json.dumps({"achievements": processed_data["achievements"]}),
                education=json.dumps({"education": processed_data["education"]}),
                extracted_keywords=json.dumps({"extracted_keywords": processed_data["extracted_keywords"]}),
                processed_at=datetime.utcnow()
            )
            
            self.db.add(processed_resume)
            await self.db.commit()
            
            # Cache the processed data
            await cache.set(
                f"processed_resume:{resume_id}",
                processed_data,
                ttl=3600  # 1 hour cache
            )
            
            logger.info(f"Successfully processed resume {resume_id}")
            return processed_data
            
        except Exception as e:
            logger.error(f"Failed to process resume {resume_id}: {e}")
            await self.db.rollback()
            return None
    
    async def _extract_structured_json(
        self,
        resume_text: str
    ) -> Optional[Dict[str, Any]]:
        """
        Extract structured JSON from resume text with timeout and retries.
        """
        prompt_template = prompt_factory.get("structured_resume")
        prompt = prompt_template.format(
            json.dumps(json_schema_factory.get("structured_resume"), indent=2),
            resume_text[:10000]  # Limit text length for LLM
        )
        
        # Try extraction with timeout
        max_retries = 2
        for attempt in range(max_retries):
            try:
                raw_output = await asyncio.wait_for(
                    self.json_agent_manager.run(prompt=prompt),
                    timeout=settings.OLLAMA_TIMEOUT
                )
                
                # Validate output
                structured_resume = StructuredResumeModel.model_validate(raw_output)
                return structured_resume.model_dump()
                
            except asyncio.TimeoutError:
                logger.warning(f"LLM timeout on attempt {attempt + 1}/{max_retries}")
                if attempt == max_retries - 1:
                    return None
                await asyncio.sleep(1)  # Brief pause before retry
                
            except ValidationError as e:
                logger.error(f"Validation error: {e}")
                return None
            except Exception as e:
                logger.error(f"Unexpected error in extraction: {e}")
                return None
    
    async def get_resume_by_id(self, resume_id: str) -> Optional[Dict[str, Any]]:
        """
        Get resume by ID with caching.
        """
        # Check cache first
        cache_key = f"resume:{resume_id}"
        cached_data = await cache.get(cache_key)
        if cached_data:
            return cached_data
        
        # Fetch from database
        result = await self.db.execute(
            select(Resume).where(Resume.resume_id == resume_id)
        )
        resume = result.scalar_one_or_none()
        
        if resume:
            data = {
                "resume_id": resume.resume_id,
                "content": resume.content,
                "content_type": resume.content_type,
                "metadata": json.loads(resume.metadata) if resume.metadata else None,
                "created_at": resume.created_at.isoformat() if hasattr(resume, 'created_at') else None
            }
            
            # Cache for future requests
            await cache.set(cache_key, data, ttl=3600)
            return data
        
        return None
    
    async def batch_process_resumes(
        self,
        resume_files: list[tuple[bytes, str, str]],
        batch_size: int = 5
    ) -> list[str]:
        """
        Process multiple resumes in batches for efficiency.
        
        Args:
            resume_files: List of (file_bytes, file_type, filename) tuples
            batch_size: Number of resumes to process concurrently
            
        Returns:
            List of resume IDs
        """
        resume_ids = []
        
        for i in range(0, len(resume_files), batch_size):
            batch = resume_files[i:i + batch_size]
            
            # Process batch concurrently
            tasks = [
                self.convert_and_store_resume(file_bytes, file_type, filename)
                for file_bytes, file_type, filename in batch
            ]
            
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for result in batch_results:
                if isinstance(result, Exception):
                    logger.error(f"Failed to process resume in batch: {result}")
                else:
                    resume_ids.append(result)
        
        return resume_ids
