from typing import List, Optional
from pydantic import BaseModel, Field


class Location(BaseModel):
    city: str
    country: str


class PersonalData(BaseModel):
    firstName: str = Field(..., alias="firstName")
    lastName: Optional[str] = Field(..., alias="lastName")
    email: str
    phone: str
    linkedin: Optional[str] = None
    portfolio: Optional[str] = None
    location: Location


class Experience(BaseModel):
    job_title: str = Field(..., alias="jobTitle")
    company: str
    location: str
    start_date: str = Field(..., alias="startDate")
    end_date: str = Field(..., alias="endDate")
    description: List[str]
    technologies_used: Optional[List[str]] = Field(
        default_factory=list, alias="technologiesUsed"
    )


class Project(BaseModel):
    project_name: str = Field(..., alias="projectName")
    description: str
    technologies_used: List[str] = Field(..., alias="technologiesUsed")
    link: Optional[str] = None
    start_date: Optional[str] = Field(None, alias="startDate")
    end_date: Optional[str] = Field(None, alias="endDate")


class Skill(BaseModel):
    category: str
    skill_name: str = Field(..., alias="skillName")


class ResearchWork(BaseModel):
    title: Optional[str] = None
    publication: Optional[str] = None
    date: Optional[str] = None
    link: Optional[str] = None
    description: Optional[str] = None


class Education(BaseModel):
    institution: str
    degree: str
    field_of_study: Optional[str] = Field(None, alias="fieldOfStudy")
    start_date: Optional[str] = Field(None, alias="startDate")
    end_date: Optional[str] = Field(None, alias="endDate")
    grade: Optional[str] = None
    description: Optional[str] = None


class StructuredResumeModel(BaseModel):
    personal_data: PersonalData = Field(..., alias="Personal Data")
    experiences: List[Experience] = Field(..., alias="Experiences")
    projects: List[Project] = Field(..., alias="Projects")
    skills: List[Skill] = Field(..., alias="Skills")
    research_work: List[ResearchWork] = Field(
        default_factory=list, alias="Research Work"
    )
    achievements: List[str] = Field(default_factory=list, alias="Achievements")
    education: List[Education] = Field(default_factory=list, alias="Education")
    extracted_keywords: List[str] = Field(
        default_factory=list, alias="Extracted Keywords"
    )

    class ConfigDict:
        validate_by_name = True
        str_strip_whitespace = True
