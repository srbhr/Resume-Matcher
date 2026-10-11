"""Review fixes for the ATS score (PR #1042)."""

from typing import Any

import pytest

from app.services.ats import compute_date_consistency


def _resume(*year_ranges: str) -> dict[str, Any]:
    return {
        "workExperience": [{"title": "PM", "years": years} for years in year_ranges]
    }


@pytest.mark.parametrize(
    "years",
    [
        "Jan 2020 - Mar 2022",
        "January 2020 - March 2022",
        "Sept. 2020 - DEC 2022",
        "jun, 2020 - may 2022",
        "Jan '20 - Mar '22",
    ],
)
def test_english_months_and_abbreviations_are_month_dates(years: str) -> None:
    # Two month dates and a bare year: the month style dominates 2 of 3.
    assert compute_date_consistency(_resume(years, "2019")) == pytest.approx(66.7)


@pytest.mark.parametrize(
    "years", ["Ene 2020 - Dic 2022", "Marc 2020 - Mayo 2022", "Summer 2020 - 2022"]
)
def test_other_words_before_a_year_are_not_month_dates(years: str) -> None:
    # Every date reads as a bare year, so the result is consistent but not named.
    resume = _resume(years, "Jan 2019 - Feb 2021")
    assert compute_date_consistency(resume) == pytest.approx(50.0)
