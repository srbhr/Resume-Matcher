"""Real Chromium renders of john_doe() and the resume data they show."""

from pathlib import Path
from typing import Any

from app.schemas import normalize_resume_data

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "ats"

# Kept here, not read from assets/pdf-templates: README previews change freely.
RENDERS = FIXTURES / "renders"


def render(name: str) -> bytes:
    return (RENDERS / f"{name}.pdf").read_bytes()


def fixture(name: str) -> bytes:
    """Current-template renders of john_doe() that exposed parse problems."""
    return (FIXTURES / f"{name}.pdf").read_bytes()


def john_doe() -> dict[str, Any]:
    return normalize_resume_data(
        {
            "personalInfo": {
                "name": "John Doe",
                "title": "Senior Software Engineer",
                "email": "john.doe@email.com",
                "phone": "+1 (415) 555-0142",
                "location": "San Francisco, CA",
            },
            "summary": (
                "Senior Software Engineer with 5+ years of proven expertise designing "
                "and building scalable backend systems, distributed architectures, and "
                "cloud-native infrastructure."
            ),
            "workExperience": [
                {
                    "id": 1,
                    "title": "Senior Software Engineer",
                    "company": "Stripe",
                    "years": "Jan 2023 - Present",
                    "description": [
                        "Designed and implemented real-time fraud detection pipeline "
                        "processing 50K+ transactions per second using Kafka and Go, "
                        "reducing fraudulent charges by 18% through optimized "
                        "distributed system architecture",
                        "Mentored 3 junior engineers and established code review "
                        "standards adopted across payments platform team, ensuring "
                        "clean, testable code practices",
                    ],
                },
                {
                    "id": 2,
                    "title": "Software Engineer",
                    "company": "Figma",
                    "years": "Jun 2021 - Dec 2022",
                    "description": [
                        "Optimized canvas rendering performance, reducing frame drop "
                        "rate by 40% on large design files through WebGL batching and "
                        "database query optimization",
                    ],
                },
            ],
            "education": [
                {
                    "id": 1,
                    "institution": "UC Berkeley",
                    "degree": "Bachelor of Science, Computer Science",
                    "years": "2019",
                }
            ],
            "additional": {
                "technicalSkills": ["Go", "Python", "Kafka", "Docker", "Kubernetes"]
            },
        }
    )
