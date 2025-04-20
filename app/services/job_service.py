import uuid
from sqlalchemy.orm import Session
from app.models import Job, Resume
from typing import List


class JobService:
    def __init__(self, db: Session):
        self.db = db

    def create_and_store_job(self, job_data: dict) -> List[str]:
        """
        Stores job data in the database and returns a list of job IDs.

        Args:
            job_data: JobUploadRequest containing job details.

        Returns:
            List of job IDs.
        """
        resume_id = job_data.get("resume_id")
        print(f"resume available? {self._is_resume_available(resume_id)}")
        if not self._is_resume_available(resume_id):
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
            job_ids.append(job_id)

        self.db.commit()
        return job_ids

    def _is_resume_available(self, resume_id: str) -> bool:
        """
        Checks if a resume exists in the database.

        Args:
            resume_id: ID of the resume to check.

        Returns:
            True if the resume exists, False otherwise.
        """
        return (
            self.db.query(Resume).filter(Resume.resume_id == resume_id).first()
            is not None
        )
