import uuid
from sqlalchemy.orm import Session
from app.models import Job
from typing import List
from app.schemas.job import JobUploadRequest


class JobService:
    def __init__(self, db: Session):
        self.db = db

    def create_and_store_job(self, job_data: JobUploadRequest) -> List[str]:
        """
        Stores job data in the database and returns a list of job IDs.

        Args:
            job_data: JobUploadRequest containing job details.

        Returns:
            List of job IDs.
        """
        job_ids = []
        for job_description in job_data.job_descriptions:
            job_id = str(uuid.uuid4())
            job = Job(
                job_id=job_id,
                resume_id=job_data.resume_id,
                content=job_description,
            )
            self.db.add(job)
            job_ids.append(job_id)

        self.db.commit()
        return job_ids
