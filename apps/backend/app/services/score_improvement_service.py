import gc
import json
import asyncio
import logging
import markdown
import numpy as np
from typing import Dict, Optional, Tuple, AsyncGenerator, List
from collections import deque
from functools import lru_cache

from sqlalchemy.future import select
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.prompt import prompt_factory
from app.schemas.json import json_schema_factory
from app.schemas.pydantic import ResumePreviewerModel
from app.agent import EmbeddingManager, AgentManager
from app.models import Resume, Job, ProcessedResume, ProcessedJob
from app.core import cache, cached
from app.core.algorithms import (
    OptimizedCosineSimilarity,
    EfficientKeywordExtractor,
    BM25,
    InvertedIndex,
    MemoryPooledEmbeddings,
    async_extract_keywords
)
from .exceptions import (
    ResumeNotFoundError,
    JobNotFoundError,
    ResumeParsingError,
    JobParsingError,
)

logger = logging.getLogger(__name__)


class OptimizedScoreImprovementService:
    """
    Optimized service combining efficient algorithms with AI for resume scoring.
    
    Features:
    - Memory-pooled embeddings with LRU eviction
    - Hybrid scoring using BM25 + embeddings
    - Cached keyword extraction
    - Batch processing for multiple comparisons
    - Streaming responses with minimal memory footprint
    """

    def __init__(self, db: AsyncSession, max_retries: int = 3):
        self.db = db
        self.max_retries = max_retries
        self.md_agent_manager = AgentManager(strategy="md")
        self.json_agent_manager = AgentManager()
        self.embedding_manager = EmbeddingManager()
        
        # Optimization components
        self.embedding_pool = MemoryPooledEmbeddings(pool_size=500, embedding_dim=768)
        self.keyword_extractor = EfficientKeywordExtractor()
        self.inverted_index = InvertedIndex()
        self.bm25_index = None
        
        # Cache for expensive operations
        self._keyword_cache = {}
        self._embedding_cache = deque(maxlen=100)  # Simple LRU cache

    async def _get_resume(self, resume_id: str) -> Tuple[Resume, ProcessedResume]:
        """Fetches resume with caching."""
        # Try cache first
        cache_key = f"resume_data:{resume_id}"
        cached_data = await cache.get(cache_key)
        
        if cached_data:
            return cached_data['resume'], cached_data['processed_resume']
        
        # Fetch from database
        query = select(Resume).where(Resume.resume_id == resume_id)
        result = await self.db.execute(query)
        resume = result.scalars().first()

        if not resume:
            raise ResumeNotFoundError(resume_id=resume_id)

        query = select(ProcessedResume).where(ProcessedResume.resume_id == resume_id)
        result = await self.db.execute(query)
        processed_resume = result.scalars().first()

        if not processed_resume:
            raise ResumeParsingError(resume_id=resume_id)
        
        # Cache for future use
        await cache.set(cache_key, {
            'resume': resume,
            'processed_resume': processed_resume
        }, ttl=3600)

        return resume, processed_resume

    async def _get_job(self, job_id: str) -> Tuple[Job, ProcessedJob]:
        """Fetches job with caching."""
        # Try cache first
        cache_key = f"job_data:{job_id}"
        cached_data = await cache.get(cache_key)
        
        if cached_data:
            return cached_data['job'], cached_data['processed_job']
        
        # Fetch from database
        query = select(Job).where(Job.job_id == job_id)
        result = await self.db.execute(query)
        job = result.scalars().first()

        if not job:
            raise JobNotFoundError(job_id=job_id)

        query = select(ProcessedJob).where(ProcessedJob.job_id == job_id)
        result = await self.db.execute(query)
        processed_job = result.scalars().first()

        if not processed_job:
            raise JobParsingError(job_id=job_id)
        
        # Cache for future use
        await cache.set(cache_key, {
            'job': job,
            'processed_job': processed_job
        }, ttl=3600)

        return job, processed_job

    @lru_cache(maxsize=1000)
    def _extract_keywords_from_json(self, keywords_json: str) -> List[str]:
        """Extract keywords from JSON with caching."""
        try:
            data = json.loads(keywords_json)
            return data.get("extracted_keywords", [])
        except (json.JSONDecodeError, TypeError):
            return []

    async def calculate_hybrid_similarity(
        self,
        resume_text: str,
        job_text: str,
        resume_embedding: np.ndarray,
        job_embedding: np.ndarray,
        alpha: float = 0.7
    ) -> float:
        """
        Calculate hybrid similarity combining embeddings and BM25.
        
        Args:
            alpha: Weight for embedding similarity (1-alpha for BM25)
        """
        # Embedding-based similarity
        embedding_sim = OptimizedCosineSimilarity.calculate(resume_embedding, job_embedding)
        
        # BM25 similarity (using job as query on resume)
        if self.bm25_index is None:
            self.bm25_index = BM25()
            self.bm25_index.fit([resume_text])
        
        bm25_score = self.bm25_index.score(job_text, 0)
        # Normalize BM25 score to [0, 1]
        normalized_bm25 = min(bm25_score / 10.0, 1.0)  # Empirical normalization
        
        # Combine scores
        hybrid_score = alpha * embedding_sim + (1 - alpha) * normalized_bm25
        
        return float(hybrid_score)

    async def get_embedding_with_pooling(self, text: str, doc_id: str) -> np.ndarray:
        """Get embedding with memory pooling."""
        # Check pool first
        pooled = self.embedding_pool.get(doc_id)
        if pooled is not None:
            return pooled
        
        # Generate embedding
        embedding = await self.embedding_manager.embed(text)
        embedding_array = np.asarray(embedding, dtype=np.float32)
        
        # Add to pool
        self.embedding_pool.add(doc_id, embedding_array)
        
        return embedding_array

    async def improve_score_with_llm(
        self,
        resume: str,
        extracted_resume_keywords: List[str],
        job: str,
        extracted_job_keywords: List[str],
        current_score: float,
        job_embedding: np.ndarray,
    ) -> Tuple[str, float]:
        """
        Improve resume using LLM with optimized prompting.
        
        Optimizations:
        - Reduced retry attempts
        - Keyword-focused prompting
        - Incremental improvements
        """
        prompt_template = prompt_factory.get("resume_improvement")
        best_resume, best_score = resume, current_score
        
        # Extract key skills for focused improvement
        job_skills = set(k.lower() for k in extracted_job_keywords[:20])  # Top 20 keywords
        resume_skills = set(k.lower() for k in extracted_resume_keywords[:20])
        missing_skills = list(job_skills - resume_skills)[:10]  # Focus on top 10 missing
        
        for attempt in range(1, min(self.max_retries + 1, 4)):  # Max 3 attempts
            logger.info(f"Improvement attempt {attempt}/{self.max_retries}")
            
            # Enhanced prompt with specific guidance
            prompt = prompt_template.format(
                raw_job_description=job[:3000],  # Limit context size
                extracted_job_keywords=", ".join(extracted_job_keywords[:30]),
                raw_resume=best_resume[:3000],
                extracted_resume_keywords=", ".join(extracted_resume_keywords[:30]),
                current_cosine_similarity=best_score,
                missing_skills=", ".join(missing_skills) if missing_skills else "None identified"
            )
            
            # Get improvement suggestion
            improved = await self.md_agent_manager.run(prompt)
            
            # Calculate new score
            improved_embedding = await self.get_embedding_with_pooling(
                improved, 
                f"improved_{attempt}"
            )
            
            score = await self.calculate_hybrid_similarity(
                improved,
                job,
                improved_embedding,
                job_embedding,
                alpha=0.8  # Higher weight on embeddings for improved versions
            )
            
            if score > best_score * 1.05:  # Only accept 5%+ improvements
                best_resume = improved
                best_score = score
                logger.debug(f"Score improved from {current_score:.3f} to {score:.3f}")
            else:
                logger.info(f"No significant improvement (score: {score:.3f})")
                break  # Stop if no improvement

        return best_resume, best_score

    @cached(ttl=600, namespace="resume_preview")
    async def get_resume_for_previewer(self, updated_resume: str) -> Dict:
        """Returns structured resume with caching."""
        prompt_template = prompt_factory.get("structured_resume")
        
        # Limit resume length for processing
        truncated_resume = updated_resume[:5000] if len(updated_resume) > 5000 else updated_resume
        
        prompt = prompt_template.format(
            json.dumps(json_schema_factory.get("resume_preview"), indent=2),
            truncated_resume,
        )
        
        raw_output = await self.json_agent_manager.run(prompt=prompt)

        try:
            resume_preview = ResumePreviewerModel.model_validate(raw_output)
            return resume_preview.model_dump()
        except ValidationError as e:
            logger.error(f"Validation error in preview generation: {e}")
            return None

    async def batch_score_resumes(
        self, 
        resume_ids: List[str], 
        job_id: str
    ) -> Dict[str, float]:
        """
        Score multiple resumes against a job efficiently.
        
        Uses batch operations and memory pooling for efficiency.
        """
        job, processed_job = await self._get_job(job_id)
        job_keywords = self._extract_keywords_from_json(processed_job.extracted_keywords)
        job_embedding = await self.get_embedding_with_pooling(job.content, job_id)
        
        # Process resumes in parallel
        tasks = []
        for resume_id in resume_ids:
            task = self._score_single_resume(resume_id, job, job_embedding)
            tasks.append(task)
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Compile scores
        scores = {}
        for resume_id, result in zip(resume_ids, results):
            if isinstance(result, Exception):
                logger.error(f"Error scoring resume {resume_id}: {result}")
                scores[resume_id] = 0.0
            else:
                scores[resume_id] = result
        
        return scores

    async def _score_single_resume(
        self,
        resume_id: str,
        job: Job,
        job_embedding: np.ndarray
    ) -> float:
        """Score a single resume against a job."""
        try:
            resume, _ = await self._get_resume(resume_id)
            resume_embedding = await self.get_embedding_with_pooling(
                resume.content,
                resume_id
            )
            
            score = await self.calculate_hybrid_similarity(
                resume.content,
                job.content,
                resume_embedding,
                job_embedding
            )
            
            return score
        except Exception as e:
            logger.error(f"Error scoring resume {resume_id}: {e}")
            return 0.0

    async def run(self, resume_id: str, job_id: str) -> Dict:
        """Main method with optimizations."""
        # Fetch data with caching
        resume, processed_resume = await self._get_resume(resume_id)
        job, processed_job = await self._get_job(job_id)

        # Extract keywords efficiently
        job_keywords = self._extract_keywords_from_json(processed_job.extracted_keywords)
        resume_keywords = self._extract_keywords_from_json(processed_resume.extracted_keywords)
        
        # Add to inverted index for fast search
        self.inverted_index.add_document(job_id, job.content)
        self.inverted_index.add_document(resume_id, resume.content)

        # Get embeddings with pooling
        resume_embedding_task = self.get_embedding_with_pooling(resume.content, resume_id)
        job_embedding_task = self.get_embedding_with_pooling(job.content, job_id)
        
        resume_embedding, job_embedding = await asyncio.gather(
            resume_embedding_task, 
            job_embedding_task
        )

        # Calculate initial score using hybrid approach
        initial_score = await self.calculate_hybrid_similarity(
            resume.content,
            job.content,
            resume_embedding,
            job_embedding
        )
        
        # Improve resume with LLM
        updated_resume, updated_score = await self.improve_score_with_llm(
            resume=resume.content,
            extracted_resume_keywords=resume_keywords,
            job=job.content,
            extracted_job_keywords=job_keywords,
            current_score=initial_score,
            job_embedding=job_embedding,
        )

        # Get structured preview
        resume_preview = await self.get_resume_for_previewer(updated_resume)

        # Prepare response
        execution = {
            "resume_id": resume_id,
            "job_id": job_id,
            "original_score": float(initial_score),
            "new_score": float(updated_score),
            "improvement_percentage": float((updated_score - initial_score) / initial_score * 100),
            "updated_resume": markdown.markdown(text=updated_resume),
            "resume_preview": resume_preview,
            "keywords_matched": len(set(resume_keywords) & set(job_keywords)),
            "total_job_keywords": len(job_keywords),
        }

        # Cleanup
        gc.collect()

        return execution

    async def run_and_stream(self, resume_id: str, job_id: str) -> AsyncGenerator:
        """Streaming with memory-efficient processing."""
        yield f"data: {json.dumps({'status': 'starting', 'message': 'Initializing analysis...'})}\n\n"
        
        # Use smaller chunks for streaming
        chunk_size = 1000
        
        try:
            # Fetch data
            resume, processed_resume = await self._get_resume(resume_id)
            job, processed_job = await self._get_job(job_id)
            
            yield f"data: {json.dumps({'status': 'parsing', 'message': 'Analyzing documents...'})}\n\n"
            
            # Extract keywords
            job_keywords = self._extract_keywords_from_json(processed_job.extracted_keywords)
            resume_keywords = self._extract_keywords_from_json(processed_resume.extracted_keywords)
            
            # Quick keyword analysis
            keywords_matched = len(set(resume_keywords) & set(job_keywords))
            yield f"data: {json.dumps({'status': 'keywords', 'matched': keywords_matched, 'total': len(job_keywords)})}\n\n"
            
            # Get embeddings
            resume_embedding = await self.get_embedding_with_pooling(resume.content, resume_id)
            job_embedding = await self.get_embedding_with_pooling(job.content, job_id)
            
            yield f"data: {json.dumps({'status': 'scoring', 'message': 'Calculating match score...'})}\n\n"
            
            # Calculate score
            initial_score = await self.calculate_hybrid_similarity(
                resume.content,
                job.content,
                resume_embedding,
                job_embedding
            )
            
            yield f"data: {json.dumps({'status': 'scored', 'score': float(initial_score)})}\n\n"
            
            # Stream improvements
            yield f"data: {json.dumps({'status': 'improving', 'message': 'Generating optimization suggestions...'})}\n\n"
            
            updated_resume, updated_score = await self.improve_score_with_llm(
                resume=resume.content,
                extracted_resume_keywords=resume_keywords,
                job=job.content,
                extracted_job_keywords=job_keywords,
                current_score=initial_score,
                job_embedding=job_embedding,
            )
            
            # Stream resume sections
            sections = updated_resume.split('\n\n')
            for i, section in enumerate(sections[:10]):  # Limit sections
                if section.strip():
                    yield f"data: {json.dumps({'status': 'section', 'index': i, 'content': section[:chunk_size]})}\n\n"
                    await asyncio.sleep(0.05)  # Small delay for streaming effect
            
            final_result = {
                "resume_id": resume_id,
                "job_id": job_id,
                "original_score": float(initial_score),
                "new_score": float(updated_score),
                "improvement_percentage": float((updated_score - initial_score) / initial_score * 100),
                "keywords_matched": keywords_matched,
                "total_keywords": len(job_keywords)
            }
            
            yield f"data: {json.dumps({'status': 'completed', 'result': final_result})}\n\n"
            
        except Exception as e:
            logger.error(f"Error in streaming: {e}")
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
        
        finally:
            gc.collect()


# Keep the original service name for compatibility
ScoreImprovementService = OptimizedScoreImprovementService
