from .base import Base
from sqlalchemy import Column, String, Table, ForeignKey


job_resume_association = Table(
    "job_resume",
    Base.metadata,
    Column("job_id", String, ForeignKey("jobs.job_id"), primary_key=True),
    Column("resume_id", String, ForeignKey("resumes.resume_id"), primary_key = True)
)