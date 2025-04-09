from .base import Base 
from sqlalchemy import Column, String, Text, Date, Integer, ForeignKey
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from .association import job_resume_association


class Job(Base):
    __tablename__ = "jobs"

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

    # one-to-many relation between user and jobs
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    owner = relationship("User", back_populates="resumes")

    # many-to-many relationship in job and resume
    jobs = relationship("JobDescription", secondary=job_resume_association, back_populates="jobs")