import json
import logging
import markdown
import numpy as np

from sqlalchemy.future import select
from typing import Dict, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession

from app.prompt import prompt_factory
from app.agent import EmbeddingManager, AgentManager
from app.models import Resume, Job, ProcessedResume, ProcessedJob
from .exceptions import (
    ResumeNotFoundError,
    JobNotFoundError,
    ResumeParsingError,
    JobParsingError,
)

logger = logging.getLogger(__name__)


class ScoreImprovementService:
    """
    Service to handle scoring of resumes and jobs using embeddings.
    Fetches Resume and Job data from the database, computes embeddings,
    and calculates cosine similarity scores. Uses LLM for iteratively improving
    the scoring process.
    """

    def __init__(self, db: AsyncSession, max_retries: int = 5):
        self.db = db
        self.max_retries = max_retries
        self.agent_manager = AgentManager(strategy="md")
        self.embedding_manager = EmbeddingManager()

    async def _get_resume(
        self, resume_id: str
    ) -> Tuple[Resume | None, ProcessedResume | None]:
        """
        Fetches the resume from the database.
        """
        query = select(Resume).where(Resume.resume_id == resume_id)
        result = await self.db.execute(query)
        resume = result.scalars().first()

        if not resume:
            raise ResumeNotFoundError(resume_id=resume_id)

        query = select(ProcessedResume).where(ProcessedResume.resume_id == resume_id)
        result = await self.db.execute(query)
        processed_resume = result.scalars().first()

        if not processed_resume:
            ResumeParsingError(resume_id=resume_id)

        return resume, processed_resume

    async def _get_job(self, job_id: str) -> Tuple[Job | None, ProcessedJob | None]:
        """
        Fetches the job from the database.
        """
        query = select(Job).where(Job.job_id == job_id)
        result = await self.db.execute(query)
        job = result.scalars().first()

        if not job:
            raise JobNotFoundError(job_id=job_id)

        query = select(ProcessedJob).where(ProcessedJob.job_id == job_id)
        result = await self.db.execute(query)
        processed_job = result.scalars().first()

        if not processed_job:
            JobParsingError(job_id=job_id)

        return job, processed_job

    def calculate_cosine_similarity(
        self,
        extracted_job_keywords_embedding: np.ndarray,
        resume_embedding: np.ndarray,
    ) -> float:
        """
        Calculates the cosine similarity between two embeddings.
        """
        if resume_embedding is None or extracted_job_keywords_embedding is None:
            return 0.0

        ejk = np.asarray(extracted_job_keywords_embedding).squeeze()
        re = np.asarray(resume_embedding).squeeze()

        return float(np.dot(ejk, re) / (np.linalg.norm(ejk) * np.linalg.norm(re)))

    async def improve_score_with_llm(
        self,
        resume: str,
        extracted_resume_keywords: str,
        job: str,
        extracted_job_keywords: str,
        previous_cosine_similarity_score: float,
        extracted_job_keywords_embedding: float,
        attempt: Optional[int] = 1,
    ) -> str:
        """
        Uses LLM to improve the score based on resume and job description.
        """
        prompt_template = prompt_factory.get("resume_improvement")
        init_prompt = prompt_template.format(
            raw_job_description=job,
            extracted_job_keywords=extracted_job_keywords,
            raw_resume=resume,
            extracted_resume_keywords=extracted_resume_keywords,
            current_cosine_similarity=previous_cosine_similarity_score,
        )
        improved_resume = await self.agent_manager.run(init_prompt)

        improved_resume_embedding = await self.embedding_manager.embed(
            text=improved_resume
        )

        new_score = self.calculate_cosine_similarity(
            improved_resume_embedding, extracted_job_keywords_embedding
        )
        if new_score > previous_cosine_similarity_score or attempt >= self.max_retries:
            return improved_resume, new_score

        return await self.improve_score_with_llm(
            resume=improved_resume,
            extracted_resume_keywords=extracted_resume_keywords,
            job=job,
            extracted_job_keywords=extracted_job_keywords,
            previous_cosine_similarity_score=new_score,
            attempt=attempt + 1,
        )

    async def run(self, resume_id: str, job_id: str) -> Dict:
        """
        Main method to run the scoring process.
        """
        resume, processed_resume = await self._get_resume(resume_id)
        job, processed_job = await self._get_job(job_id)

        extracted_job_keywords = ", ".join(
            json.loads(processed_job.extracted_keywords).get("extracted_keywords", [])
        )

        extracted_resume_keywords = ", ".join(
            json.loads(processed_resume.extracted_keywords).get(
                "extracted_keywords", []
            )
        )

        resume_embedding = await self.embedding_manager.embed(text=resume.content)
        extracted_job_keywords_embedding = await self.embedding_manager.embed(
            text=extracted_job_keywords
        )

        cosine_similarity_score = self.calculate_cosine_similarity(
            extracted_job_keywords_embedding, resume_embedding
        )
        updated_resume, updated_score = await self.improve_score_with_llm(
            resume=resume.content,
            extracted_resume_keywords=extracted_resume_keywords,
            job=job.content,
            extracted_job_keywords=extracted_job_keywords,
            previous_cosine_similarity_score=cosine_similarity_score,
            extracted_job_keywords_embedding=extracted_job_keywords_embedding,
        )

        return {
            "resume_id": resume_id,
            "job_id": job_id,
            "original_score": cosine_similarity_score,
            "new_score": updated_score,
            "updated_resume": markdown.markdown(text=updated_resume),
        }
