"""FRONTEND_BASE_URL with a trailing slash (a Discord setup had
``http://localhost:3000/``) made the PDF print URLs ``...3000//print/...``."""

import pytest

from app.config import Settings


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("http://localhost:3000/", "http://localhost:3000"),
        ("http://localhost:3000//", "http://localhost:3000"),
        (" http://localhost:3000 ", "http://localhost:3000"),
        ("http://localhost:3000", "http://localhost:3000"),
        ("https://rm.example.com/app/", "https://rm.example.com/app"),
    ],
)
def test_frontend_base_url_is_stored_without_a_trailing_slash(value, expected):
    assert Settings(frontend_base_url=value).frontend_base_url == expected
