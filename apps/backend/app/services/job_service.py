import uuid
import json
import logging
import asyncio
from typing import List, Dict, Any, Optional
from functools import lru_cache

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent import AgentManager
from app.prompt import prompt_factory
from app.schemas.json import json_schema_factory
from app.models import Job, Resume, ProcessedJob
from app.schemas.pydantic import StructuredJobModel
from app.core import cache, cached
from app.core.algorithms import (
    EfficientKeywordExtractor,
    async_extract_keywords,
    MemoryEfficientTokenizer
)

logger = logging.getLogger(__name__)


class OptimizedJobService:
    """
    Optimized job service with memory-efficient processing.
    
    Features:
    - Batch job processing
    - Keyword extraction with caching
    - Concurrent processing with memory limits
    - Streaming job parsing
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.json_agent_manager = AgentManager(model="gemma3:4b")
        self.keyword_extractor = EfficientKeywordExtractor()
        self.tokenizer = MemoryEfficientTokenizer()
        self._extraction_cache = {}
        
    @lru_cache(maxsize=100)
    async def _is_resume_available(self, resume_id: str) -> bool:
        """Check if resume exists with caching."""
        # Check cache first
        cache_key = f"resume_exists:{resume_id}"
        cached_result = await cache.get(cache_key)
        
        if cached_result is not None:
            return cached_result
        
        # Query database
        query = select(Resume).where(Resume.resume_id == resume_id)
        result = await self.db.scalar(query)
        exists = result is not None
        
        # Cache result
        await cache.set(cache_key, exists, ttl=3600)
        
        return exists

    async def create_and_store_job_batch(
        self, 
        job_data: dict, 
        batch_size: int = 5
    ) -> List[str]:
        """
        Process multiple job descriptions efficiently in batches.
        
        Args:
            job_data: Dictionary containing resume_id and job_descriptions
            batch_size: Number of jobs to process concurrently
        """
        resume_id = str(job_data.get("resume_id"))
        
        if not await self._is_resume_available(resume_id):
            raise AssertionError(
                f"Resume corresponding to resume_id: {resume_id} not found"
            )
        
        job_descriptions = job_data.get("job_descriptions", [])
        job_ids = []
        
        # Process jobs in batches
        for i in range(0, len(job_descriptions), batch_size):
            batch = job_descriptions[i:i + batch_size]
            batch_tasks = []
            
            for job_description in batch:
                task = self._process_single_job(resume_id, job_description)
                batch_tasks.append(task)
            
            # Process batch concurrently
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            for result in batch_results:
                if isinstance(result, Exception):
                    logger.error(f"Error processing job: {result}")
                else:
                    job_ids.append(result)
        
        # Commit all changes
        await self.db.commit()
        
        return job_ids

    async def _process_single_job(
        self, 
        resume_id: str, 
        job_description: str
    ) -> str:
        """Process a single job description."""
        job_id = str(uuid.uuid4())
        
        # Create job entry
        job = Job(
            job_id=job_id,
            resume_id=resume_id,
            content=job_description,
        )
        self.db.add(job)
        
        # Extract and store structured data
        await self._extract_and_store_structured_job(
            job_id=job_id, 
            job_description_text=job_description
        )
        
        logger.info(f"Processed job ID: {job_id}")
        return job_id

    async def create_and_store_job(self, job_data: dict) -> List[str]:
        """
        Legacy method for compatibility - uses batch processing internally.
        """
        return await self.create_and_store_job_batch(job_data, batch_size=5)

    @cached(ttl=600, namespace="structured_job")
    async def _extract_structured_json(
        self, 
        job_description_text: str
    ) -> Optional[Dict[str, Any]]:
        """
        Extract structured JSON with caching and optimization.
        
        Optimizations:
        - Text truncation for large descriptions
        - Caching of results
        - Keyword pre-extraction
        """
        # Truncate very long descriptions
        max_length = 5000
        if len(job_description_text) > max_length:
            job_description_text = job_description_text[:max_length] + "..."
        
        # Pre-extract keywords for better LLM focus
        keywords = await async_extract_keywords(
            self.keyword_extractor,
            job_description_text,
            top_k=20
        )
        keyword_hints = ", ".join([kw[0] for kw in keywords[:10]])
        
        # Generate prompt with keyword hints
        prompt_template = prompt_factory.get("structured_job")
        prompt = prompt_template.format(
            json.dumps(json_schema_factory.get("structured_job"), indent=2),
            job_description_text,
            keyword_hints=keyword_hints  # Add keyword hints to prompt
        )
        
        try:
            # Get structured data from LLM
            raw_output = await self.json_agent_manager.run(prompt=prompt)
            
            # Validate
            structured_job = StructuredJobModel.model_validate(raw_output)
            result = structured_job.model_dump(mode="json")
            
            # Enhance with pre-extracted keywords if needed
            if not result.get("extracted_keywords"):
                result["extracted_keywords"] = [kw[0] for kw in keywords]
            
            return result
            
        except ValidationError as e:
            logger.error(f"Validation error in job extraction: {e}")
            # Return partial result with extracted keywords
            return {
                "job_title": self._extract_job_title(job_description_text),
                "extracted_keywords": [kw[0] for kw in keywords],
                "job_summary": job_description_text[:500]
            }
        except Exception as e:
            logger.error(f"Error extracting structured job: {e}")
            return None

    def _extract_job_title(self, text: str) -> str:
        """Extract likely job title from text."""
        lines = text.strip().split('\n')
        for line in lines[:5]:  # Check first 5 lines
            line = line.strip()
            if line and len(line) < 100:  # Likely a title
                return line
        return "Unknown Position"

    async def _extract_and_store_structured_job(
        self, 
        job_id: str, 
        job_description_text: str
    ) -> Optional[str]:
        """
        Extract and store structured job data with optimization.
        """
        structured_job = await self._extract_structured_json(job_description_text)
        if not structured_job:
            logger.warning(f"Structured job extraction failed for job_id: {job_id}")
            return None

        # Prepare data with safe JSON serialization
        processed_job = ProcessedJob(
            job_id=job_id,
            job_title=structured_job.get("job_title"),
            company_profile=self._safe_json_dumps(
                structured_job.get("company_profile")
            ),
            location=self._safe_json_dumps(
                structured_job.get("location")
            ),
            date_posted=structured_job.get("date_posted"),
            employment_type=structured_job.get("employment_type"),
            job_summary=structured_job.get("job_summary"),
            key_responsibilities=self._safe_json_dumps({
                "key_responsibilities": structured_job.get("key_responsibilities", [])
            }),
            qualifications=self._safe_json_dumps(
                structured_job.get("qualifications", [])
            ),
            compensation_and_benfits=self._safe_json_dumps(
                structured_job.get("compensation_and_benfits", [])
            ),
            application_info=self._safe_json_dumps(
                structured_job.get("application_info", [])
            ),
            extracted_keywords=self._safe_json_dumps({
                "extracted_keywords": structured_job.get("extracted_keywords", [])
            }),
        )

        self.db.add(processed_job)
        await self.db.flush()
        
        return job_id

    @staticmethod
    def _safe_json_dumps(data: Any) -> Optional[str]:
        """Safely serialize data to JSON."""
        if data is None:
            return None
        try:
            return json.dumps(data, ensure_ascii=False)
        except (TypeError, ValueError):
            return json.dumps(str(data))

    async def get_jobs_by_resume(
        self, 
        resume_id: str, 
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get all jobs associated with a resume.
        
        Optimizations:
        - Batch loading
        - Result caching
        - Pagination support
        """
        cache_key = f"resume_jobs:{resume_id}:{limit}"
        cached_result = await cache.get(cache_key)
        
        if cached_result:
            return cached_result
        
        # Query jobs
        query = (
            select(Job, ProcessedJob)
            .join(ProcessedJob, Job.job_id == ProcessedJob.job_id)
            .where(Job.resume_id == resume_id)
            .limit(limit)
        )
        
        result = await self.db.execute(query)
        jobs_data = []
        
        for job, processed_job in result:
            job_data = {
                "job_id": job.job_id,
                "job_title": processed_job.job_title,
                "company": self._extract_company_name(processed_job.company_profile),
                "location": self._extract_location_string(processed_job.location),
                "employment_type": processed_job.employment_type,
                "summary": processed_job.job_summary,
                "keywords": self._extract_keywords_list(processed_job.extracted_keywords),
                "created_at": job.created_at.isoformat() if hasattr(job, 'created_at') else None
            }
            jobs_data.append(job_data)
        
        # Cache results
        await cache.set(cache_key, jobs_data, ttl=300)
        
        return jobs_data

    def _extract_company_name(self, company_profile_json: str) -> str:
        """Extract company name from JSON profile."""
        if not company_profile_json:
            return "Unknown Company"
        try:
            data = json.loads(company_profile_json)
            return data.get("name", "Unknown Company")
        except:
            return "Unknown Company"

    def _extract_location_string(self, location_json: str) -> str:
        """Extract location string from JSON."""
        if not location_json:
            return "Location not specified"
        try:
            data = json.loads(location_json)
            if isinstance(data, dict):
                return f"{data.get('city', '')}, {data.get('state', '')}".strip(', ')
            return str(data)
        except:
            return "Location not specified"

    def _extract_keywords_list(self, keywords_json: str) -> List[str]:
        """Extract keywords list from JSON."""
        if not keywords_json:
            return []
        try:
            data = json.loads(keywords_json)
            return data.get("extracted_keywords", [])[:10]  # Limit to top 10
        except:
            return []

    async def compare_jobs_batch(
        self,
        job_ids: List[str],
        resume_id: str
    ) -> Dict[str, float]:
        """
        Compare multiple jobs against a resume for ranking.
        
        Returns dictionary of job_id -> score mappings.
        """
        from .score_improvement_service import OptimizedScoreImprovementService
        
        # Use the optimized service for batch comparison
        score_service = OptimizedScoreImprovementService(self.db)
        
        # Flip the comparison - score resume against each job
        scores = {}
        for job_id in job_ids:
            try:
                result = await score_service.run(resume_id, job_id)
                scores[job_id] = result.get("original_score", 0.0)
            except Exception as e:
                logger.error(f"Error comparing job {job_id}: {e}")
                scores[job_id] = 0.0
        
        return scores


# Keep original class name for compatibility
JobService = OptimizedJobService
