import logging
import numpy as np

from typing import Dict, Optional
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.concurrency import run_in_threadpool

from app.models import Resume, Job
from app.agent import EmbeddingManager, AgentManager

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

    async def get_resume_embedding(self, resume_id: str) -> Optional[np.ndarray]:
        """
        Fetches the resume from the database and computes its embedding.
        """
        query = select(Resume).where(Resume.resume_id == resume_id)
        result = await self.db.execute(query)
        resume = result.scalars().first()

        if not resume:
            return None

        return await run_in_threadpool(
            self.embedding_manager.get_embedding,
            resume.content,
            model=self.embedding_model,
        )
