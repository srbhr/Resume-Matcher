"""Base URLs compare case-insensitively on scheme and host only."""

import pytest

from app.llm import normalize_endpoint


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, ""),
        ("  ", ""),
        ("HTTPS://Proxy.Example/TeamA/v1/", "https://proxy.example/TeamA/v1"),
        ("http://LOCALHOST:11434", "http://localhost:11434"),
        ("http://User:Pw@Host.Example/v1", "http://User:Pw@host.example/v1"),
        ("http://[::1]:8080/V1", "http://[::1]:8080/V1"),
        ("https://h.example/v1?Team=A", "https://h.example/v1?Team=A"),
        ("not a url", "not a url"),
    ],
)
def test_normalize_endpoint(raw: str | None, expected: str) -> None:
    assert normalize_endpoint(raw) == expected


def test_normalize_endpoint_is_idempotent() -> None:
    once = normalize_endpoint("HTTPS://Proxy.Example/TeamA/v1/")
    assert normalize_endpoint(once) == once
