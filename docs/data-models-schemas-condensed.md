# Data Models and Schemas

## Database Architecture
Resume Matcher uses SQLite with SQLAlchemy ORM for privacy-focused local data storage.

```python
# Core database models
class Resume(Base):
    """Original resume content"""
    __tablename__ = "resumes"
    
    id = Column(Integer, primary_key=True, index=True)
    resume_id = Column(String, unique=True, nullable=False)
    content = Column(Text, nullable=False)                   # Markdown/HTML content
    content_type = Column(String, nullable=False)            # 'md' or 'html'
    created_at = Column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    
    # Relationships
    raw_resume_association = relationship("ProcessedResume", back_populates="raw_resume", uselist=False)
    jobs = relationship("Job", back_populates="resumes", secondary=job_resume_association)

class ProcessedResume(Base):
    """AI-extracted structured resume data"""
    __tablename__ = "processed_resumes"
    
    resume_id = Column(String, ForeignKey("resumes.resume_id"), primary_key=True)
    personal_data = Column(JSON, nullable=False)        # Name, contact info
    experiences = Column(JSON, nullable=True)           # Work history
    skills = Column(JSON, nullable=True)                # Technical skills
    education = Column(JSON, nullable=True)             # Academic background
    extracted_keywords = Column(JSON, nullable=True)    # AI-identified keywords
    
    # Relationships
    raw_resume = relationship("Resume", back_populates="raw_resume_association")
    processed_jobs = relationship("ProcessedJob", secondary=job_resume_association)

class Job(Base):
    """Original job description"""
    __tablename__ = "jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, unique=True, nullable=False)
    content = Column(Text, nullable=False)
    
    # Relationships
    raw_job_association = relationship("ProcessedJob", back_populates="raw_job", uselist=False)
    resumes = relationship("Resume", back_populates="jobs", secondary=job_resume_association)
```

## Association Table
```python
# Many-to-many relationship between jobs and resumes
job_resume_association = Table(
    'job_resume',
    Base.metadata,
    Column('processed_job_id', String, ForeignKey("processed_jobs.job_id"), primary_key=True),
    Column('processed_resume_id', String, ForeignKey("processed_resumes.resume_id"), primary_key=True),
)
```

## Schema Versioning
```python
class SchemaVersionManager:
    CURRENT_VERSION = "1.2.0"
    
    VERSION_MIGRATIONS = {
        "1.0.0:1.1.0": migrate_1_0_to_1_1,
        "1.1.0:1.2.0": migrate_1_1_to_1_2,
    }
    
    async def migrate_resume_data(self, data: dict, from_version: str) -> dict:
        """Migrates resume data from old schema version to current"""
        current_version = from_version
        while current_version != self.CURRENT_VERSION:
            next_version = self._get_next_version(current_version)
            migration_key = f"{current_version}:{next_version}"
            migration_func = self.VERSION_MIGRATIONS[migration_key]
            data = await migration_func(data)
            current_version = next_version
        return data
```
