from typing import Optional, List
from typing_extensions import Literal
from pydantic import BaseModel, Field, HttpUrl, EmailStr, field_validator


class CompanyProfile(BaseModel):
    company_name: str = Field(..., alias="companyName")
    industry: Optional[str] = None
    website: Optional[HttpUrl] = None
    description: Optional[str] = None


class Location(BaseModel):
    city: str
    state: Optional[str] = None
    country: Optional[str] = None
    remote_status: Literal["Fully Remote", "Hybrid", "On-site", "Remote"] = Field(
        ..., alias="remoteStatus"
    )

    @field_validator("remote_status", mode="before")
    def validate_remote_status(cls, value):
        if isinstance(value, str):
            v_lower = value.lower()
            mapping = {
                "fully remote": "Fully Remote",
                "hybrid": "Hybrid",
                "on-site": "On-site",
                "remote": "Remote",
            }
            if v_lower in mapping:
                return mapping[v_lower]
        raise ValueError(
            "remote_status must be one of: Fully Remote, Hybrid, On-site, Remote (case insensitive)"
        )


class Qualifications(BaseModel):
    required: List[str]
    preferred: Optional[List[str]] = None


class CompensationAndBenefits(BaseModel):
    salary_range: Optional[str] = Field(..., alias="salaryRange")
    benefits: Optional[List[str]] = None


class ApplicationInfo(BaseModel):
    how_to_apply: Optional[str] = Field(..., alias="howToApply")
    apply_link: Optional[str] = Field(..., alias="applyLink")
    contact_email: Optional[EmailStr] = Field(..., alias="contactEmail")


class StructuredJobModel(BaseModel):
    job_title: str = Field(..., alias="jobTitle")
    company_profile: CompanyProfile = Field(..., alias="companyProfile")
    location: Location
    date_posted: str = Field(..., alias="datePosted")
    employment_type: Literal[
        "Full-time", "Part-time", "Contract", "Internship", "Temporary"
    ] = Field(..., alias="employmentType")
    job_summary: str = Field(..., alias="jobSummary")
    key_responsibilities: List[str] = Field(..., alias="keyResponsibilities")
    qualifications: Qualifications
    compensation_and_benefits: Optional[CompensationAndBenefits] = Field(
        None, alias="compensationAndBenefits"
    )
    application_info: Optional[ApplicationInfo] = Field(None, alias="applicationInfo")
    extracted_keywords: List[str] = Field(..., alias="extractedKeywords")

    class ConfigDict:
        validate_by_name = True
        str_strip_whitespace = True
