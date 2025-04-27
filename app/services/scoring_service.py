import json
import logging
import numpy as np

from sqlalchemy.future import select
from typing import Dict, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.concurrency import run_in_threadpool

from app.agent import EmbeddingManager, AgentManager
from app.models import Resume, Job, ProcessedResume, ProcessedJob
from .exceptions import (
    ResumeNotFoundError,
    JobNotFoundError,
    ResumeParsingError,
)

logger = logging.getLogger(__name__)


class ScoringService:
    """
    Service to handle scoring of resumes and jobs using embeddings.
    Fetches Resume and Job data from the database, computes embeddings,
    and calculates cosine similarity scores. Uses LLM for iteratively improving
    the scoring process.
    """

    def __init__(
        self, resume_id: str, job_id: str, db: AsyncSession, max_retries: int = 5
    ):
        self.db = db
        self.job_id = job_id
        self.resume_id = resume_id
        self.max_retries = max_retries
        self.agent_manager = AgentManager()
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
            raise ResumeNotFoundError(self.resume_id)

        query = select(ProcessedResume).where(ProcessedResume.resume_id == resume_id)
        result = await self.db.execute(query)
        processed_resume = result.scalars().first()

        if not processed_resume:
            ResumeParsingError(self.resume_id)

        return resume, processed_resume

    async def _get_job(self, job_id: str) -> Tuple[Job | None, ProcessedJob | None]:
        """
        Fetches the job from the database.
        """
        query = select(Job).where(Job.job_id == job_id)
        result = await self.db.execute(query)
        job = result.scalars().first()

        if not job:
            raise JobNotFoundError(self.job_id)

        query = select(ProcessedJob).where(ProcessedJob.job_id == job_id)
        result = await self.db.execute(query)
        processed_job = result.scalars().first()

        if not processed_job:
            ResumeParsingError(self.resume_id)

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
        return np.dot(extracted_job_keywords_embedding, resume_embedding) / (
            np.linalg.norm(extracted_job_keywords_embedding)
            * np.linalg.norm(resume_embedding)
        )

    async def improve_score_with_llm(
        self, resume: Resume, job: Job, cosine_similarity_score: float
    ) -> str:
        """
        Uses LLM to improve the score based on resume and job description.
        """
        prompt = f"Resume: {resume.content}\nJob Description: {job.content}\nCurrent Score: Improve the score."
        response = await self.agent_manager(prompt)
        return response

    async def run(self) -> Dict:
        """
        Main method to run the scoring process.
        """
        resume, processed_resume = await self._get_resume(self.resume_id)
        job, processed_job = await self._get_job(self.job_id)

        extracted_job_keywords = json.loads(processed_job.extracted_keywords)

        resume_embedding = await self.embedding_manager(text=resume.content)
        extracted_job_keywords_embedding = await self.embedding_manager(
            text=", ".join(extracted_job_keywords.get("extracted_keywords", []))
        )

        cosine_similarity_score = self.calculate_cosine_similarity(
            extracted_job_keywords_embedding, resume_embedding
        )
        improved_score = await self.improve_score_with_llm(
            resume, job, cosine_similarity_score
        )

        return {
            "resume_id": self.resume_id,
            "job_id": self.job_id,
            "score": cosine_similarity_score,
            "improved_score": improved_score,
        }
