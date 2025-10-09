import uuid
import json
import logging
from typing import List, Dict, Any, Optional

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import TimeoutException, ConnectError, HTTPStatusError

from app.agent import AgentManager
from app.agent.exceptions import ProviderError, StrategyError
from app.prompt import prompt_factory
from app.schemas.json import json_schema_factory
from app.models import Job, Resume, ProcessedJob
from app.schemas.pydantic import StructuredJobModel
from .exceptions import JobNotFoundError
from .utils import retry_with_exponential_backoff

logger = logging.getLogger(__name__)


class JobService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.json_agent_manager = AgentManager()

    @staticmethod
    def _serialize_to_json(data: Any, wrap_in_key: Optional[str] = None) -> Optional[str]:
        """
        Helper method to serialize data to JSON string with optional key wrapping.
        
        Args:
            data: Data to serialize (can be dict, list, or any JSON-serializable type)
            wrap_in_key: Optional key to wrap the data in a dictionary
            
        Returns:
            JSON string if data exists, None otherwise
        """
        if not data:
            return None
        
        if wrap_in_key:
            data = {wrap_in_key: data}
        
        return json.dumps(data)

    async def create_and_store_job(self, job_data: dict) -> List[str]:
        """
        Stores job data in the database and returns a list of job IDs.
        """
        resume_id = str(job_data.get("resume_id"))

        if not await self._is_resume_available(resume_id):
            raise AssertionError(
                f"resume corresponding to resume_id: {resume_id} not found"
            )

        job_ids = []
        for job_description in job_data.get("job_descriptions", []):
            job_id = str(uuid.uuid4())
            job = Job(
                job_id=job_id,
                resume_id=str(resume_id),
                content=job_description,
            )
            self.db.add(job)

            await self._extract_and_store_structured_job(
                job_id=job_id, job_description_text=job_description
            )
            logger.info(f"Job ID: {job_id}")
            job_ids.append(job_id)

        await self.db.commit()
        return job_ids

    async def _is_resume_available(self, resume_id: str) -> bool:
        """
        Checks if a resume exists in the database.
        """
        query = select(Resume).where(Resume.resume_id == resume_id)
        result = await self.db.scalar(query)
        return result is not None

    async def _extract_and_store_structured_job(
        self, job_id, job_description_text: str
    ):
        """
        extract and store structured job data in the database
        """
        structured_job = await self._extract_structured_json(job_description_text)
        if not structured_job:
            logger.info("Structured job extraction failed.")
            return None

        processed_job = ProcessedJob(
            job_id=job_id,
            job_title=structured_job.get("job_title"),
            company_profile=self._serialize_to_json(
                structured_job.get("company_profile")
            ),
            location=self._serialize_to_json(
                structured_job.get("location")
            ),
            date_posted=structured_job.get("date_posted"),
            employment_type=structured_job.get("employment_type"),
            job_summary=structured_job.get("job_summary"),
            key_responsibilities=self._serialize_to_json(
                structured_job.get("key_responsibilities"),
                wrap_in_key="key_responsibilities"
            ),
            qualifications=self._serialize_to_json(
                structured_job.get("qualifications"),
                wrap_in_key="qualifications"
            ),
            compensation_and_benefits=self._serialize_to_json(
                structured_job.get("compensation_and_benefits"),
                wrap_in_key="compensation_and_benefits"
            ),
            application_info=self._serialize_to_json(
                structured_job.get("application_info"),
                wrap_in_key="application_info"
            ),
            extracted_keywords=self._serialize_to_json(
                structured_job.get("extracted_keywords"),
                wrap_in_key="extracted_keywords"
            ),
        )

        self.db.add(processed_job)
        await self.db.flush()
        await self.db.commit()

        return job_id

    @retry_with_exponential_backoff(
        max_retries=3,
        initial_delay=1.0,
        max_delay=30.0,
        exponential_base=2.0
    )
    async def _call_llm_for_job_extraction(self, prompt: str) -> Dict[str, Any]:
        """
        Calls the LLM to extract structured job data with retry logic.
        
        Args:
            prompt: The prompt to send to the LLM
            
        Returns:
            Raw output from the LLM
            
        Raises:
            Various network/timeout exceptions that trigger retries
        """
        logger.debug("Calling LLM for job extraction")
        return await self.json_agent_manager.run(prompt=prompt)

    async def _extract_structured_json(
        self, job_description_text: str
    ) -> Dict[str, Any] | None:
        """
        Uses the AgentManager+JSONWrapper to ask the LLM to
        return the data in exact JSON schema we need.
        Includes retry logic for transient failures.
        """
        prompt_template = prompt_factory.get("structured_job")
        prompt = prompt_template.format(
            json.dumps(json_schema_factory.get("structured_job"), indent=2),
            job_description_text,
        )
        logger.info(f"Structured Job Prompt: {prompt}")
        
        # Call LLM with retry logic
        try:
            raw_output = await self._call_llm_for_job_extraction(prompt)
        except (TimeoutException, ConnectError, HTTPStatusError, ConnectionError, OSError, ProviderError, StrategyError) as e:
            logger.exception("LLM call failed after all retries")
            # Return None to maintain backward compatibility with existing error handling
            return None

        try:
            structured_job: StructuredJobModel = StructuredJobModel.model_validate(
                raw_output
            )
        except ValidationError as e:
            logger.info(f"Validation error: {e}")
            error_details = []
            for error in e.errors():
                field = " -> ".join(str(loc) for loc in error["loc"])
                error_details.append(f"{field}: {error['msg']}")
            
            logger.info(f"Validation error details: {'; '.join(error_details)}")
            return None
        return structured_job.model_dump(mode="json")

    async def get_job_with_processed_data(self, job_id: str) -> Optional[Dict]:
        """
        Fetches both job and processed job data from the database and combines them.

        Args:
            job_id: The ID of the job to retrieve

        Returns:
            Combined data from both job and processed_job models

        Raises:
            JobNotFoundError: If the job is not found
        """
        job_query = select(Job).where(Job.job_id == job_id)
        job_result = await self.db.execute(job_query)
        job = job_result.scalars().first()

        if not job:
            raise JobNotFoundError(job_id=job_id)

        processed_query = select(ProcessedJob).where(ProcessedJob.job_id == job_id)
        processed_result = await self.db.execute(processed_query)
        processed_job = processed_result.scalars().first()

        combined_data = {
            "job_id": job.job_id,
            "raw_job": {
                "id": job.id,
                "resume_id": job.resume_id,
                "content": job.content,
                "created_at": job.created_at.isoformat() if job.created_at else None,
            },
            "processed_job": None
        }

        if processed_job:
            combined_data["processed_job"] = {
                "job_title": processed_job.job_title,
                "company_profile": json.loads(processed_job.company_profile) if processed_job.company_profile else None,
                "location": json.loads(processed_job.location) if processed_job.location else None,
                "date_posted": processed_job.date_posted,
                "employment_type": processed_job.employment_type,
                "job_summary": processed_job.job_summary,
                "key_responsibilities": json.loads(processed_job.key_responsibilities).get("key_responsibilities", []) if processed_job.key_responsibilities else None,
                "qualifications": json.loads(processed_job.qualifications).get("qualifications", []) if processed_job.qualifications else None,
                "compensation_and_benefits": json.loads(processed_job.compensation_and_benefits).get("compensation_and_benefits", []) if processed_job.compensation_and_benefits else None,
                "application_info": json.loads(processed_job.application_info).get("application_info", []) if processed_job.application_info else None,
                "extracted_keywords": json.loads(processed_job.extracted_keywords).get("extracted_keywords", []) if processed_job.extracted_keywords else None,
                "processed_at": processed_job.processed_at.isoformat() if processed_job.processed_at else None,
            }

        return combined_data
