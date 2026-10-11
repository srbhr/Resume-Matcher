"""Unit tests for the queue's metadata extraction and failure codes."""

import pytest
from fastapi import HTTPException

from app.ai_budget import AIOperationDeadlineExceeded
from app.ai_limits import PromptSizeError
from app.services.queue_worker import extract_job_details, failure_code


class TestExtractJobDetails:
    """Test heuristic metadata extraction with 0 LLM calls."""

    def test_extract_explicit_labels(self):
        text = """
Job Title: Principal Software Engineer
Company: Stripe
Req ID: REQ-987654

About the role:
We are seeking a senior engineer to design distributed financial systems...
"""
        details = extract_job_details(text)
        assert details["role"] == "Principal Software Engineer"
        assert details["company"] == "Stripe"
        assert details["job_req_id"] == "REQ-987654"

    def test_extract_at_pattern(self):
        text = """
Senior Data Scientist @ Netflix
Los Gatos, CA

Netflix is seeking a Senior Data Scientist to work on recommendation algorithms...
"""
        details = extract_job_details(text)
        assert details["role"] == "Senior Data Scientist"
        assert details["company"] == "Netflix"

    def test_extract_about_company_heuristic(self):
        text = """
Fullstack Developer

About Datadog
Datadog is the monitoring and security platform for cloud applications...
"""
        details = extract_job_details(text)
        assert details["role"] == "Fullstack Developer"
        assert details["company"] == "Datadog"

    def test_empty_text_returns_empty_details(self):
        details = extract_job_details("")
        assert details["role"] == ""
        assert details["company"] == ""
        assert details["job_req_id"] == ""

        whitespace_details = extract_job_details("   \n\n   ")
        assert whitespace_details["role"] == ""


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (HTTPException(status_code=404, detail="Resume not found"), "not_found"),
        (HTTPException(status_code=422, detail="Too large: 123 chars"), "too_large"),
        (PromptSizeError("prompt has 999999 characters"), "too_large"),
        (AIOperationDeadlineExceeded("deadline"), "timeout"),
        (TimeoutError(), "timeout"),
        (RuntimeError("401 from provider: key sk-secret rejected"), "failed"),
    ],
)
def test_failure_code_never_exposes_error_text(error: Exception, code: str) -> None:
    assert failure_code(error) == code
