from uuid import UUID
from pydantic import BaseModel, Field


class ResumeImprovementRequest(BaseModel):
    job_id: UUID = Field(..., description="DB UUID reference to the job")
    resume_id: UUID = Field(..., description="DB UUID reference to the resume")
