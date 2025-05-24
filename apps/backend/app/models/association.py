from .base import Base
from sqlalchemy import Column, String, Table, ForeignKey


job_resume_association = Table(
    "job_resume",
    Base.metadata,
    Column(
        "processed_job_id",
        String,
        ForeignKey("processed_jobs.job_id"),
        primary_key=True,
    ),
    Column(
        "processed_resume_id",
        String,
        ForeignKey("processed_resumes.resume_id"),
        primary_key=True,
    ),
)
