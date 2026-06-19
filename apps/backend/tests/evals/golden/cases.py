"""Golden fixtures for the eval harness.

Each entry in :data:`GOLDEN_CASES` bundles everything the two eval layers need
for one realistic tailoring scenario:

* ``name``            — a short, human-readable id.
* ``original``        — the master resume dict (ResumeData-compatible).
* ``job_description`` — the target JD text.
* ``jd_keywords``     — keywords the tailored resume is expected to surface
                        (used by ``jd_keywords_present``).
* ``tailored_good``   — a faithful, JD-aware tailoring of ``original``. Every
                        section is preserved, no employers are invented, and
                        the JD keywords appear. Structural scorers should give
                        this a clean bill of health, and the LLM judge should
                        score it >= 3.
* ``tailored_bad``    — a deliberately broken tailoring (drops a section,
                        invents an employer, rewrites the candidate's name).
                        Structural scorers MUST flag it. It exists so the
                        scorer tests can prove they detect real violations
                        rather than always returning "OK".

These are plain Python constants — no I/O, no LLM. To add a new golden case,
append another dict with the same keys to ``GOLDEN_CASES``. Keep ``original``
and ``tailored_good`` valid against ``app.schemas.ResumeData`` so
``is_valid_resume`` stays meaningful.
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Case 1 — backend engineer targeting a senior platform role
# ---------------------------------------------------------------------------

_CASE1_ORIGINAL: dict[str, Any] = {
    "personalInfo": {
        "name": "Jane Doe",
        "title": "Senior Backend Engineer",
        "email": "jane@example.com",
        "phone": "+1-555-0100",
        "location": "San Francisco, CA",
        "website": "https://janedoe.dev",
        "linkedin": "linkedin.com/in/janedoe",
        "github": "github.com/janedoe",
    },
    "summary": (
        "Backend engineer with 6 years of experience building scalable "
        "Python APIs and microservices."
    ),
    "workExperience": [
        {
            "id": 1,
            "title": "Senior Backend Engineer",
            "company": "Acme Corp",
            "location": "San Francisco, CA",
            "years": "Jan 2021 - Present",
            "description": [
                "Built REST APIs serving 50K requests/day using Python and FastAPI",
                "Led migration from monolith to microservices architecture",
                "Mentored 3 junior developers on backend best practices",
            ],
        },
        {
            "id": 2,
            "title": "Software Engineer",
            "company": "StartupCo",
            "location": "New York, NY",
            "years": "Jun 2018 - Dec 2020",
            "description": [
                "Developed payment processing system handling $2M monthly",
                "Wrote unit and integration tests improving coverage from 40% to 85%",
            ],
        },
    ],
    "education": [
        {
            "id": 1,
            "institution": "MIT",
            "degree": "B.S. Computer Science",
            "years": "2014 - 2018",
            "description": "Graduated with honors, Dean's List",
        }
    ],
    "personalProjects": [
        {
            "id": 1,
            "name": "OpenAPI Generator",
            "role": "Creator & Maintainer",
            "years": "Mar 2021 - Present",
            "description": [
                "CLI tool generating API clients from OpenAPI specs",
                "500+ GitHub stars, used by 30+ companies",
            ],
        }
    ],
    "additional": {
        "technicalSkills": [
            "Python",
            "FastAPI",
            "Docker",
            "AWS",
            "PostgreSQL",
            "Redis",
        ],
        "languages": ["English (Native)", "Spanish (Conversational)"],
        "certificationsTraining": ["AWS Solutions Architect Associate"],
        "awards": ["Employee of the Year 2022"],
    },
    "customSections": {},
    "sectionMeta": [],
}

_CASE1_JD: str = (
    "Senior Backend Engineer at TechCorp\n\n"
    "We are looking for a Senior Backend Engineer to join our platform team. "
    "You will design and build scalable APIs using Python and FastAPI. "
    "Experience with Docker, Kubernetes, and AWS is required. "
    "Terraform and GraphQL experience is a plus.\n\n"
    "Requirements:\n"
    "- 5+ years backend development experience\n"
    "- Strong Python skills with FastAPI or similar frameworks\n"
    "- Experience with microservices architecture\n"
    "- Familiarity with CI/CD pipelines and agile methodologies\n"
    "- Bachelor's degree in CS or equivalent\n"
)

# A faithful tailoring: same employers, same identity, JD keywords woven in
# only where they are already true (Kubernetes/CI/CD added to summary + the
# Acme bullets, which is defensible given the migration work).
_CASE1_TAILORED_GOOD: dict[str, Any] = {
    "personalInfo": dict(_CASE1_ORIGINAL["personalInfo"]),
    "summary": (
        "Senior backend engineer with 6 years building scalable Python and "
        "FastAPI APIs and microservices, with hands-on Docker, Kubernetes, "
        "and AWS experience and a track record of shipping via CI/CD."
    ),
    "workExperience": [
        {
            "id": 1,
            "title": "Senior Backend Engineer",
            "company": "Acme Corp",
            "location": "San Francisco, CA",
            "years": "Jan 2021 - Present",
            "description": [
                "Built REST APIs serving 50K requests/day using Python, FastAPI, and Docker",
                "Led migration from a monolith to a microservices architecture deployed on Kubernetes",
                "Implemented CI/CD pipelines and mentored 3 junior developers on backend best practices",
            ],
        },
        {
            "id": 2,
            "title": "Software Engineer",
            "company": "StartupCo",
            "location": "New York, NY",
            "years": "Jun 2018 - Dec 2020",
            "description": [
                "Developed an AWS-hosted payment processing system handling $2M monthly",
                "Wrote unit and integration tests improving coverage from 40% to 85%",
            ],
        },
    ],
    "education": list(_CASE1_ORIGINAL["education"]),
    "personalProjects": list(_CASE1_ORIGINAL["personalProjects"]),
    "additional": {
        "technicalSkills": [
            "Python",
            "FastAPI",
            "Kubernetes",
            "Docker",
            "AWS",
            "PostgreSQL",
            "Redis",
        ],
        "languages": ["English (Native)", "Spanish (Conversational)"],
        "certificationsTraining": ["AWS Solutions Architect Associate"],
        "awards": ["Employee of the Year 2022"],
    },
    "customSections": {},
    "sectionMeta": [],
}

# A broken tailoring: identity rewritten, work history dropped, and a
# fabricated employer ("Globex Industries") inserted in projects-as-work.
_CASE1_TAILORED_BAD: dict[str, Any] = {
    "personalInfo": {
        **_CASE1_ORIGINAL["personalInfo"],
        "name": "John Smith",  # identity changed — must be flagged
    },
    "summary": (
        "Senior backend engineer with Python, FastAPI, Kubernetes, Docker, "
        "AWS, and CI/CD experience."
    ),
    # workExperience emptied AND populated with a never-held employer.
    "workExperience": [
        {
            "id": 99,
            "title": "Principal Engineer",
            "company": "Globex Industries",  # fabricated employer
            "location": "Remote",
            "years": "Jan 2015 - Present",
            "description": ["Owned the entire platform on Kubernetes and AWS"],
        }
    ],
    "education": [],  # education dropped — must be flagged
    "personalProjects": list(_CASE1_ORIGINAL["personalProjects"]),
    "additional": {
        "technicalSkills": ["Python", "FastAPI", "Kubernetes", "Docker", "AWS"],
    },
    "customSections": {},
    "sectionMeta": [],
}

# ---------------------------------------------------------------------------
# Case 2 — data analyst pivoting toward a data-engineering role
# ---------------------------------------------------------------------------

_CASE2_ORIGINAL: dict[str, Any] = {
    "personalInfo": {
        "name": "Carlos Reyes",
        "title": "Data Analyst",
        "email": "carlos@example.com",
        "phone": "+1-555-0199",
        "location": "Austin, TX",
        "website": None,
        "linkedin": "linkedin.com/in/carlosreyes",
        "github": None,
    },
    "summary": (
        "Data analyst with 4 years turning messy datasets into dashboards and "
        "reports that drive product decisions."
    ),
    "workExperience": [
        {
            "id": 1,
            "title": "Data Analyst",
            "company": "RetailWorks",
            "location": "Austin, TX",
            "years": "Feb 2022 - Present",
            "description": [
                "Built weekly KPI dashboards in SQL and Tableau for 200+ stakeholders",
                "Automated recurring reports, cutting manual effort by 12 hours/week",
            ],
        },
        {
            "id": 2,
            "title": "Junior Analyst",
            "company": "Insight Labs",
            "location": "Austin, TX",
            "years": "Aug 2020 - Jan 2022",
            "description": [
                "Cleaned and modeled survey data for 30+ client studies",
                "Wrote Python scripts to validate data quality before analysis",
            ],
        },
    ],
    "education": [
        {
            "id": 1,
            "institution": "University of Texas at Austin",
            "degree": "B.A. Economics",
            "years": "2016 - 2020",
            "description": "Minor in Statistics",
        }
    ],
    "personalProjects": [],
    "additional": {
        "technicalSkills": ["SQL", "Python", "Tableau", "Excel", "pandas"],
        "languages": ["English (Native)", "Spanish (Native)"],
        "certificationsTraining": [],
        "awards": [],
    },
    "customSections": {},
    "sectionMeta": [],
}

_CASE2_JD: str = (
    "Data Engineer at DataFlow Inc.\n\n"
    "We need a Data Engineer to build and maintain our analytics pipelines. "
    "You will write SQL and Python, build ETL workflows with Airflow, and "
    "model data in a cloud warehouse such as Snowflake or BigQuery.\n\n"
    "Requirements:\n"
    "- Strong SQL and Python\n"
    "- Experience building ETL/data pipelines\n"
    "- Comfort with data modeling and data quality\n"
    "- Bonus: dbt, Airflow, Snowflake\n"
)

# Faithful tailoring: same employers/identity, reframes the existing SQL/Python
# and data-quality work toward pipelines/ETL without inventing tools.
_CASE2_TAILORED_GOOD: dict[str, Any] = {
    "personalInfo": dict(_CASE2_ORIGINAL["personalInfo"]),
    "summary": (
        "Analytics-minded engineer with 4 years of SQL and Python, building "
        "ETL workflows, modeling data, and enforcing data quality to power "
        "reporting and product decisions."
    ),
    "workExperience": [
        {
            "id": 1,
            "title": "Data Analyst",
            "company": "RetailWorks",
            "location": "Austin, TX",
            "years": "Feb 2022 - Present",
            "description": [
                "Built weekly KPI dashboards backed by SQL data models for 200+ stakeholders",
                "Automated recurring ETL reporting in Python, cutting manual effort by 12 hours/week",
            ],
        },
        {
            "id": 2,
            "title": "Junior Analyst",
            "company": "Insight Labs",
            "location": "Austin, TX",
            "years": "Aug 2020 - Jan 2022",
            "description": [
                "Modeled and transformed survey data for 30+ client studies",
                "Wrote Python scripts to enforce data quality before analysis",
            ],
        },
    ],
    "education": list(_CASE2_ORIGINAL["education"]),
    "personalProjects": [],
    "additional": {
        "technicalSkills": [
            "SQL",
            "Python",
            "ETL",
            "data modeling",
            "Tableau",
            "Excel",
            "pandas",
        ],
        "languages": ["English (Native)", "Spanish (Native)"],
        "certificationsTraining": [],
        "awards": [],
    },
    "customSections": {},
    "sectionMeta": [],
}

# Broken tailoring: real employers replaced by a fabricated one, work history
# effectively wiped, identity name altered.
_CASE2_TAILORED_BAD: dict[str, Any] = {
    "personalInfo": {
        **_CASE2_ORIGINAL["personalInfo"],
        "name": "Carlos R. Mendez",  # identity changed
    },
    "summary": "Data engineer with SQL, Python, Airflow, dbt, and Snowflake experience.",
    "workExperience": [
        {
            "id": 1,
            "title": "Senior Data Engineer",
            "company": "DataFlow Systems",  # fabricated employer (never held)
            "location": "Remote",
            "years": "Jan 2019 - Present",
            "description": ["Owned ETL pipelines on Snowflake with Airflow and dbt"],
        }
    ],
    "education": list(_CASE2_ORIGINAL["education"]),
    "personalProjects": [],
    "additional": {
        "technicalSkills": ["SQL", "Python", "Airflow", "dbt", "Snowflake"],
    },
    "customSections": {},
    "sectionMeta": [],
}


GOLDEN_CASES: list[dict[str, Any]] = [
    {
        "name": "backend_engineer_platform_role",
        "original": _CASE1_ORIGINAL,
        "job_description": _CASE1_JD,
        "jd_keywords": [
            "Python",
            "FastAPI",
            "Docker",
            "Kubernetes",
            "AWS",
            "microservices",
            "CI/CD",
        ],
        "tailored_good": _CASE1_TAILORED_GOOD,
        "tailored_bad": _CASE1_TAILORED_BAD,
    },
    {
        "name": "data_analyst_to_data_engineer",
        "original": _CASE2_ORIGINAL,
        "job_description": _CASE2_JD,
        "jd_keywords": ["SQL", "Python", "ETL", "data quality", "data modeling"],
        "tailored_good": _CASE2_TAILORED_GOOD,
        "tailored_bad": _CASE2_TAILORED_BAD,
    },
]
