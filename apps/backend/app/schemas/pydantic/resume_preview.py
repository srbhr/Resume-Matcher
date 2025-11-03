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
    company: Optional[str] = None
    location: Optional[str] = None
    years: Optional[str] = None
    description: List[Optional[str]] = []


class EducationItem(BaseModel):
    id: int
    institution: str
    degree: str
    years: Optional[str] = None
    description: Optional[str] = None


class ProjectItem(BaseModel):
    id: int
    name: str
    role: Optional[str] = None
    years: Optional[str] = None
    description: List[str] = []


class AdditionalInfo(BaseModel):
    technicalSkills: List[str] = []
    languages: List[str] = []
    certificationsTraining: List[str] = []
    awards: List[str] = []


class ResumePreviewerModel(BaseModel):
    personalInfo: PersonalInfo
    summary: Optional[str] = None
    workExperience: List[ExperienceItem] = []
    education: List[EducationItem] = []
    personalProjects: List[ProjectItem] = []
    additional: AdditionalInfo = AdditionalInfo()
