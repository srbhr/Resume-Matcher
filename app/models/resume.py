from .base import Base 
from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from .association import job_resume_association

class Resume(Base):
    __tablename__ = "resumes"

    resume_id = Column(String, primary_key = True, index=True) # uuid field

    personal_data = Column(JSON, nullable=False)
    experiences = Column(JSON, nullable=True)
    projects = Column(JSON, nullable=True)
    skills = Column(JSON, nullable=True)
    research_work = Column(JSON, nullable=True)
    achievements = Column(JSON, nullable=True)
    education = Column(JSON, nullable=True)
    extracted_keywords = Column(JSON, nullable=True)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    owner = relationship("User", back_populates="resumes")

    jobs = relationship("Job", secondary=job_resume_association, back_populates="resumes")
