from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from sqlalchemy import Column, String, Integer, ForeignKey, Text, DateTime, text, event
import hashlib

from .base import Base
from .association import job_resume_association


class ProcessedResume(Base):
    __tablename__ = "processed_resumes"

    resume_id = Column(
        String,
        ForeignKey("resumes.resume_id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    personal_data = Column(JSON, nullable=False)
    experiences = Column(JSON, nullable=True)
    projects = Column(JSON, nullable=True)
    skills = Column(JSON, nullable=True)
    research_work = Column(JSON, nullable=True)
    achievements = Column(JSON, nullable=True)
    education = Column(JSON, nullable=True)
    extracted_keywords = Column(JSON, nullable=True)
    processed_at = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
        index=True,
    )

    # owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # owner = relationship("User", back_populates="processed_resumes")
    raw_resume = relationship("Resume", back_populates="raw_resume_association")

    processed_jobs = relationship(
        "ProcessedJob",
        secondary=job_resume_association,
        back_populates="processed_resumes",
    )


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True, index=True)
    resume_id = Column(String, unique=True, nullable=False)
    content = Column(Text, nullable=False)
    # May be NULL for legacy rows or direct test inserts; service layer will
    # backfill & enforce uniqueness logically when processing uploads.
    content_hash = Column(String, nullable=True, index=True)
    content_type = Column(String, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
        index=True,
    )

    raw_resume_association = relationship(
        "ProcessedResume", back_populates="raw_resume", uselist=False
    )

    jobs = relationship("Job", back_populates="resumes")


# ---------------------------------------------------------------------------
# Automatic content_hash backfill on insert (defensive for direct test inserts)
# ---------------------------------------------------------------------------
@event.listens_for(Resume, "before_insert", propagate=True)
def _resume_before_insert(mapper, connection, target):  # type: ignore[unused-argument]
    if not getattr(target, "content_hash", None) and getattr(target, "content", None):
        try:
            target.content_hash = hashlib.sha256(target.content.encode("utf-8")).hexdigest()
        except Exception:  # pragma: no cover - defensive
            target.content_hash = None
