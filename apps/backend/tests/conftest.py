"""Shared test fixtures for Resume Matcher backend tests."""

import copy
import os
import socket
import sys
import tempfile
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any, NoReturn

import pytest


# Set DATA_DIR before pytest imports any test module. Several integration tests
# import app.main at module scope, which constructs Settings and the global
# Database during collection; a function fixture would be too late to protect
# developer state from those imports.
_ORIGINAL_DATA_DIR = os.environ.get("DATA_DIR")
_TEST_DATA_DIR_CONTEXT = tempfile.TemporaryDirectory(prefix="resume-matcher-tests-")
_TEST_DATA_DIR = Path(_TEST_DATA_DIR_CONTEXT.name)
os.environ["DATA_DIR"] = str(_TEST_DATA_DIR)

import app.config as _config_module  # noqa: E402 - DATA_DIR must be set first

_IMPORTED_CONFIG_FILE_PATH = _config_module.CONFIG_FILE_PATH


class UnexpectedNetworkAccess(RuntimeError):
    """Raised when a deterministic backend test attempts a real connection."""


def pytest_unconfigure(config: pytest.Config) -> None:
    """Restore the caller environment and remove session-level temporary data."""
    del config  # Hook argument is required by pytest but otherwise unused.
    if _ORIGINAL_DATA_DIR is None:
        os.environ.pop("DATA_DIR", None)
    else:
        os.environ["DATA_DIR"] = _ORIGINAL_DATA_DIR
    _TEST_DATA_DIR_CONTEXT.cleanup()


@pytest.fixture(scope="session")
def imported_config_file_path() -> Path:
    """Return config.py's path alias as captured immediately after safe import."""
    return _IMPORTED_CONFIG_FILE_PATH


@pytest.fixture(scope="session")
def backend_test_data_dir() -> Path:
    """Return the temporary DATA_DIR installed before application imports."""
    return _TEST_DATA_DIR


@pytest.fixture(autouse=True)
def deny_external_network(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Make accidental provider traffic fail before opening a socket.

    ASGITransport and respx-backed HTTP tests do not open sockets and continue
    to exercise their real in-process transports. Tests requiring an actual
    network connection must explicitly replace this guard at their boundary.
    """

    def blocked_connection(*args: Any, **kwargs: Any) -> NoReturn:
        del args, kwargs
        raise UnexpectedNetworkAccess(
            "External network access blocked in deterministic backend tests"
        )

    monkeypatch.setattr(socket, "create_connection", blocked_connection)
    monkeypatch.setattr(socket.socket, "connect", blocked_connection)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked_connection)
    yield


@pytest.fixture(autouse=True)
async def isolated_backend_state(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[Any]:
    """Isolate config, crypto and every imported database alias per test."""
    import app.config as config_module
    import app.database as database_module
    from app import crypto
    from app.config_cache import invalidate_config_cache
    from app.database import Database

    test_data_dir = tmp_path / "data"
    test_db = Database(db_path=test_data_dir / "resume_matcher.db")

    monkeypatch.setattr(config_module.settings, "data_dir", test_data_dir)
    # Preserve compatibility with code/tests that still monkeypatch the legacy
    # name while guaranteeing old config implementations are safe during RED.
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", test_data_dir / "config.json")
    monkeypatch.setattr(database_module, "db", test_db)

    # Modules such as routers and app.main import ``db`` by value. Patch every
    # alias already loaded during collection; modules imported later receive
    # app.database.db, which is already the isolated instance.
    for module_name, module in tuple(sys.modules.items()):
        if not module_name.startswith("app.") or module is None:
            continue
        if isinstance(getattr(module, "db", None), Database):
            monkeypatch.setattr(module, "db", test_db)

    invalidate_config_cache()
    crypto.reset_cache()
    try:
        yield test_db
    finally:
        invalidate_config_cache()
        crypto.reset_cache()
        await test_db.close()


# ---------------------------------------------------------------------------
# Sample resume data — full ResumeData-compatible dict
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_resume() -> dict:
    """A realistic resume dict matching the ResumeData schema."""
    return {
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
        "summary": "Backend engineer with 6 years of experience building scalable Python APIs and microservices.",
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
            "technicalSkills": ["Python", "FastAPI", "Docker", "AWS", "PostgreSQL", "Redis"],
            "languages": ["English (Native)", "Spanish (Conversational)"],
            "certificationsTraining": ["AWS Solutions Architect Associate"],
            "awards": ["Employee of the Year 2022"],
        },
        "customSections": {},
        "sectionMeta": [],
    }


@pytest.fixture
def sample_resume_copy(sample_resume) -> dict:
    """Deep copy of sample_resume for mutation-safe tests."""
    return copy.deepcopy(sample_resume)


# ---------------------------------------------------------------------------
# Job-related fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_job_keywords() -> dict:
    """Extracted job keywords matching the LLM output format."""
    return {
        "required_skills": ["Python", "FastAPI", "Docker", "Kubernetes"],
        "preferred_skills": ["AWS", "Terraform", "GraphQL"],
        "experience_requirements": ["5+ years backend development"],
        "education_requirements": ["Bachelor's in CS or equivalent"],
        "key_responsibilities": [
            "Design and build scalable APIs",
            "Lead technical architecture decisions",
        ],
        "keywords": ["microservices", "CI/CD", "agile", "REST API"],
        "experience_years": 5,
        "seniority_level": "senior",
    }


@pytest.fixture
def sample_job_description() -> str:
    """A realistic job description text."""
    return (
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


# ---------------------------------------------------------------------------
# Master resume — used for alignment validation
# ---------------------------------------------------------------------------

@pytest.fixture
def master_resume(sample_resume) -> dict:
    """Master resume (source of truth) — same as sample_resume by default."""
    return copy.deepcopy(sample_resume)


# ---------------------------------------------------------------------------
# ResumeChange fixtures for diff-based tests
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_changes():
    """A set of ResumeChange dicts covering all action types."""
    from app.schemas.models import ResumeChange

    return [
        ResumeChange(
            path="summary",
            action="replace",
            original="Backend engineer with 6 years of experience building scalable Python APIs and microservices.",
            value="Senior backend engineer with 6 years building scalable Python APIs, microservices, and cloud infrastructure on AWS.",
            reason="Added cloud/AWS keywords from JD",
        ),
        ResumeChange(
            path="workExperience[0].description[0]",
            action="replace",
            original="Built REST APIs serving 50K requests/day using Python and FastAPI",
            value="Designed and built REST APIs serving 50K requests/day using Python, FastAPI, and Docker",
            reason="Added Docker keyword from JD",
        ),
        ResumeChange(
            path="workExperience[0].description",
            action="append",
            original=None,
            value="Implemented CI/CD pipelines with GitHub Actions reducing deploy time by 40%",
            reason="Added CI/CD keyword from JD",
        ),
        ResumeChange(
            path="additional.technicalSkills",
            action="reorder",
            original=None,
            value=["Python", "FastAPI", "Docker", "AWS", "PostgreSQL", "Redis"],
            reason="Already in good order, no change needed",
        ),
    ]


# ---------------------------------------------------------------------------
# Isolated database — swap the global TinyDB singleton for a temp-file DB
# ---------------------------------------------------------------------------

@pytest.fixture
def isolated_db(isolated_backend_state: Any) -> Any:
    """Expose the default per-test real SQLite database to tests that need it."""
    return isolated_backend_state
