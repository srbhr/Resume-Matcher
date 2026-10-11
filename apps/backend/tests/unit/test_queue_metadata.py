"""Unit tests for the queue's metadata extraction and failure codes."""

import time

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
        ("first_line", "role", "company"),
        [
            ("Frontend Developer @ Google", "Frontend Developer", "Google"),
            ("Senior   Engineer at Stripe", "Senior Engineer", "Stripe"),
            # An earlier "at" whose tail is not a company name stays in the role.
            ("Engineer at Google, Inc at Foo", "Engineer at Google, Inc", "Foo"),
        ],
    )
    def test_extract_at_pattern_variants(self, first_line, role, company):
        details = extract_job_details(first_line)
        assert (details["role"], details["company"]) == (role, company)

    @pytest.mark.parametrize(
        ("text", "role", "company"),
        [
            # A header first line is skipped; the title is on line two.
            (
                "About Us\nSenior Platform Engineer\nWe build things.",
                "Senior Platform Engineer",
                "",
            ),
            # The "Role at Company" pattern is found on a later line too.
            ("Welcome!\nStaff Engineer at Acme\nRemote", "Staff Engineer", "Acme"),
            # The company name as a header is not the role.
            (
                "Stripe\nPayments Engineer\nCompany: Stripe",
                "Payments Engineer",
                "Stripe",
            ),
            # Only the first three non-empty lines are considered.
            ("About Us\n\nOverview\nWelcome\nBackend Engineer", "", ""),
        ],
    )
    def test_role_fallback_checks_the_first_three_nonempty_lines(
        self, text, role, company
    ):
        details = extract_job_details(text)
        assert (details["role"], details["company"]) == (role, company)

    @pytest.mark.parametrize(
        "prefix", ["role-", "client-", "job id", "req #", "a", "x at"]
    )
    def test_long_whitespace_runs_are_parsed_in_linear_time(self, prefix):
        """CodeQL py/polynomial-redos: ~100 KB used to take about a minute."""
        started = time.perf_counter()
        extract_job_details(prefix + " " * 100_000 + "!")
        assert time.perf_counter() - started < 1.0


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
