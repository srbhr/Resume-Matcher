from .base import Base
from sqlalchemy import Column, String, Text, Date, Integer, ForeignKey, DateTime
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from .association import job_resume_association
import datetime


class ProcessedJob(Base):
    __tablename__ = "processed_jobs"

    job_id = Column(String, primary_key=True, index=True)  # uuid field
    job_title = Column(String, nullable=False)
    company_profile = Column(Text, nullable=True)
    location = Column(String, nullable=True)
    date_posted = Column(Date, nullable=True)
    employment_type = Column(String, nullable=True)
    job_summary = Column(Text, nullable=False)
    key_responsibilities = Column(JSON, nullable=True)
    qualifications = Column(JSON, nullable=True)
    compensation_and_benfits = Column(JSON, nullable=True)
    application_info = Column(JSON, nullable=True)
    extracted_keywords = Column(JSON, nullable=True)
    processed_at = Column(
        DateTime, default=datetime.datetime.now(datetime.timezone.utc)
    )

    # one-to-many relation between user and jobs
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    owner = relationship("User", back_populates="processed_jobs")
    raw_job = relationship("Job", back_populates="processed_job")

    # many-to-many relationship in job and resume
    resumes = relationship(
        "ProcessedResume",
        secondary=job_resume_association,
        back_populates="jobs",
    )


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, unique=True, nullable=False)
    content = Column(Text, nullable=False)
    content_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now(datetime.timezone.utc))

    processed_job = relationship(
        "ProcessedJob", back_populates="raw_job", uselist=False
    )
