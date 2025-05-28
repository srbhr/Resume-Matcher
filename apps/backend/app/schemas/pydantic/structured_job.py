import enum

from typing import Optional, List
from pydantic import BaseModel, Field


class EmploymentTypeEnum(str, enum.Enum):
    """Case-insensitive Enum for employment types."""

    FULL_TIME = "Full-time"
    PART_TIME = "Part-time"
    CONTRACT = "Contract"
    INTERNSHIP = "Internship"
    TEMPORARY = "Temporary"
    NOT_SPECIFIED = "Not Specified"

    @classmethod
    def _missing_(cls, value: object):
        """Handles case-insensitive lookup."""
        if isinstance(value, str):
            value_lower = value.lower()
            mapping = {member.value.lower(): member for member in cls}
            if value_lower in mapping:
                return mapping[value_lower]

        raise ValueError(
            "employment type must be one of: Full-time, Part-time, Contract, Internship, Temporary, Not Specified (case insensitive)"
        )


class RemoteStatusEnum(str, enum.Enum):
    """Case-insensitive Enum for remote work status."""

    FULLY_REMOTE = "Fully Remote"
    HYBRID = "Hybrid"
    ON_SITE = "On-site"
    REMOTE = "Remote"
    NOT_SPECIFIED = "Not Specified"

    @classmethod
    def _missing_(cls, value: object):
        """Handles case-insensitive lookup."""
        if isinstance(value, str):
            value_lower = value.lower()
            mapping = {member.value.lower(): member for member in cls}
            if value_lower in mapping:
                return mapping[value_lower]

        raise ValueError(
            "remote_status must be one of: Fully Remote, Hybrid, On-site, Remote, Not Specified (case insensitive)"
        )


class CompanyProfile(BaseModel):
    company_name: str = Field(..., alias="companyName")
    industry: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None


class Location(BaseModel):
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    remote_status: RemoteStatusEnum = Field(..., alias="remoteStatus")


class Qualifications(BaseModel):
    required: List[str]
    preferred: Optional[List[str]] = None


class CompensationAndBenefits(BaseModel):
    salary_range: Optional[str] = Field(..., alias="salaryRange")
    benefits: Optional[List[str]] = None


class ApplicationInfo(BaseModel):
    how_to_apply: Optional[str] = Field(..., alias="howToApply")
    apply_link: Optional[str] = Field(..., alias="applyLink")
    contact_email: Optional[str] = Field(..., alias="contactEmail")


class StructuredJobModel(BaseModel):
    job_title: str = Field(..., alias="jobTitle")
    company_profile: CompanyProfile = Field(..., alias="companyProfile")
    location: Location
    date_posted: str = Field(..., alias="datePosted")
    employment_type: EmploymentTypeEnum = Field(..., alias="employmentType")
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
