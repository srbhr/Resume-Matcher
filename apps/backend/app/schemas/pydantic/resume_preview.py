from typing import List, Optional
from pydantic import BaseModel


class PersonalInfo(BaseModel):
    name: str
    title: Optional[str] = None
    email: str
    phone: str
    location: Optional[str] = None
    website: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None


class ExperienceItem(BaseModel):
    id: int
    title: str
    company: str
    location: Optional[str] = None
    years: str
    description: List[str]


class EducationItem(BaseModel):
    id: int
    institution: str
    degree: str
    years: str
    description: str


class ResumePreviewerModel(BaseModel):
    personalInfo: PersonalInfo
    summary: str
    experience: List[ExperienceItem]
    education: List[EducationItem]
    skills: List[str]
