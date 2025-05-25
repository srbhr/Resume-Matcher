from uuid import UUID
from typing import List
from pydantic import BaseModel, Field


class JobUploadRequest(BaseModel):
    job_descriptions: List[str] = Field(
        ..., description="List of job descriptions in markdown format"
    )
    resume_id: UUID = Field(..., description="UUID reference to the resume")
