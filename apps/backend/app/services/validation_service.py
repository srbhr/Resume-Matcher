"""
Resume Validation Service

Provides functionality to validate resume content and structure,
checking for critical sections and formatting issues.
"""

import logging
import re
from typing import List, Dict, Any, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class ValidationSeverity(str, Enum):
    """Severity levels for validation issues"""
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationIssue:
    """Represents a single validation issue"""
    
    def __init__(self, section: str, severity: ValidationSeverity, message: str, suggestion: Optional[str] = None):
        self.section = section
        self.severity = severity
        self.message = message
        self.suggestion = suggestion
    
    def to_dict(self) -> Dict[str, str]:
        return {
            "section": self.section,
            "severity": self.severity.value,
            "message": self.message,
            "suggestion": self.suggestion or "",
        }


class ResumeValidator:
    """Validates resume content and structure"""
    
    # Critical sections that should be in a resume
    CRITICAL_SECTIONS = [
        "contact information",
        "phone",
        "email",
        "education",
        "experience",
        "work experience",
        "skills",
    ]
    
    # Common section keywords
    SECTION_PATTERNS = {
        "contact": r"(contact\s+information|phone|email|address|linkedin|github|portfolio)",
        "summary": r"(professional\s+summary|objective|executive\s+summary|profile)",
        "experience": r"(work\s+experience|experience|employment|professional\s+experience)",
        "education": r"(education|degree|university|college|school)",
        "skills": r"(skills|technical\s+skills|competencies|proficiencies)",
        "projects": r"(projects?|portfolio|work samples)",
        "certifications": r"(certifications?|licenses?|credentials)",
        "languages": r"(languages?|linguistic)",
    }
    
    def __init__(self):
        self.issues: List[ValidationIssue] = []
    
    def validate(self, resume_content: str) -> Dict[str, Any]:
        """
        Validate resume content and return validation results
        
        Args:
            resume_content: The resume content as text
            
        Returns:
            Dictionary with validation results
        """
        self.issues = []
        resume_lower = resume_content.lower()
        resume_length = len(resume_content)
        
        # Check content length
        self._check_content_length(resume_length)
        
        # Check for critical sections
        self._check_critical_sections(resume_lower)
        
        # Check formatting
        self._check_formatting(resume_content)
        
        # Check keywords
        self._check_keywords(resume_lower)
        
        # Determine overall validity
        has_errors = any(issue.severity == ValidationSeverity.ERROR for issue in self.issues)
        has_warnings = any(issue.severity == ValidationSeverity.WARNING for issue in self.issues)
        
        return {
            "is_valid": not has_errors,
            "score": self._calculate_score(),
            "issues": [issue.to_dict() for issue in self.issues],
            "sections_found": self._find_sections(resume_lower),
            "statistics": {
                "total_characters": resume_length,
                "total_lines": len(resume_content.split('\n')),
                "has_errors": has_errors,
                "has_warnings": has_warnings,
                "issue_count": len(self.issues),
            }
        }
    
    def _check_content_length(self, length: int) -> None:
        """Check if resume has reasonable content length"""
        if length < 100:
            self.issues.append(
                ValidationIssue(
                    "content",
                    ValidationSeverity.ERROR,
                    "Resume content is too short (less than 100 characters)",
                    "Add more details about your experience, education, and skills"
                )
            )
        elif length > 50000:
            self.issues.append(
                ValidationIssue(
                    "content",
                    ValidationSeverity.WARNING,
                    "Resume content is very long (more than 50,000 characters)",
                    "Consider condensing your resume to be more concise and easier to read"
                )
            )
    
    def _check_critical_sections(self, resume_lower: str) -> None:
        """Check for presence of critical resume sections"""
        critical_found = {section: False for section in self.CRITICAL_SECTIONS}
        
        for section in self.CRITICAL_SECTIONS:
            if section in resume_lower or re.search(rf'\b{section}\b', resume_lower):
                critical_found[section] = True
        
        # Check if contact info exists (phone or email)
        has_contact = bool(re.search(r'[\w\.-]+@[\w\.-]+\.\w+', resume_lower)) or \
                     bool(re.search(r'\+?1?\s*\(?[\d\s\-\)]{9,}\)?', resume_lower))
        
        if not has_contact:
            self.issues.append(
                ValidationIssue(
                    "contact",
                    ValidationSeverity.ERROR,
                    "No contact information found (email or phone number)",
                    "Add your email address and/or phone number for employers to contact you"
                )
            )
        
        # Check for education
        if not critical_found.get("education", False):
            self.issues.append(
                ValidationIssue(
                    "education",
                    ValidationSeverity.WARNING,
                    "No education section found",
                    "Add your educational background, degrees, and institutions"
                )
            )
        
        # Check for experience
        experience_keywords = critical_found.get("experience", False) or critical_found.get("work experience", False)
        if not experience_keywords:
            self.issues.append(
                ValidationIssue(
                    "experience",
                    ValidationSeverity.ERROR,
                    "No work experience section found",
                    "Add your previous job roles, responsibilities, and achievements"
                )
            )
        
        # Check for skills
        if not critical_found.get("skills", False):
            self.issues.append(
                ValidationIssue(
                    "skills",
                    ValidationSeverity.WARNING,
                    "No skills section found",
                    "Add a skills section highlighting your technical and soft skills"
                )
            )
    
    def _check_formatting(self, resume_content: str) -> None:
        """Check for formatting issues"""
        lines = resume_content.split('\n')
        
        # Check for excessive blank lines
        blank_line_count = sum(1 for line in lines if line.strip() == '')
        if blank_line_count > len(lines) * 0.2:
            self.issues.append(
                ValidationIssue(
                    "formatting",
                    ValidationSeverity.INFO,
                    "Resume has many blank lines",
                    "Remove excessive blank lines to make the resume more compact"
                )
            )
        
        # Check for line length (lines that are too long might indicate formatting issues)
        very_long_lines = [line for line in lines if len(line) > 150]
        if very_long_lines:
            self.issues.append(
                ValidationIssue(
                    "formatting",
                    ValidationSeverity.INFO,
                    f"Found {len(very_long_lines)} very long lines (>150 characters)",
                    "Consider breaking long lines for better readability"
                )
            )
    
    def _check_keywords(self, resume_lower: str) -> None:
        """Check for common keywords that strengthen a resume"""
        power_keywords = [
            'achievement', 'accomplishment', 'improved', 'increased', 'decreased',
            'managed', 'led', 'coordinated', 'designed', 'developed', 'implemented',
            'optimized', 'analyzed', 'created', 'launched', 'established'
        ]
        
        found_keywords = sum(1 for keyword in power_keywords if keyword in resume_lower)
        
        if found_keywords < 3:
            self.issues.append(
                ValidationIssue(
                    "keywords",
                    ValidationSeverity.WARNING,
                    "Resume contains few action/power verbs",
                    "Use strong action verbs like 'Led', 'Developed', 'Improved' to describe accomplishments"
                )
            )
    
    def _find_sections(self, resume_lower: str) -> Dict[str, bool]:
        """Find which standard sections are present"""
        sections_found = {}
        
        for section_name, pattern in self.SECTION_PATTERNS.items():
            sections_found[section_name] = bool(re.search(pattern, resume_lower))
        
        return sections_found
    
    def _calculate_score(self) -> float:
        """Calculate validation score (0-100)"""
        # Start with 100 points
        score = 100.0
        
        # Deduct points for each issue
        for issue in self.issues:
            if issue.severity == ValidationSeverity.ERROR:
                score -= 20
            elif issue.severity == ValidationSeverity.WARNING:
                score -= 10
            elif issue.severity == ValidationSeverity.INFO:
                score -= 3
        
        # Ensure score is between 0 and 100
        return max(0, min(100, score))
