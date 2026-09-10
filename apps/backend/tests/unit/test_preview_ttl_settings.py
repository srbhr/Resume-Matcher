"""Bad preview-lifetime environment values must not prevent backend startup."""

import pytest

from app.config import Settings


@pytest.mark.parametrize(
    "value,expected",
    [
        ("", 86400),
        ("not-seconds", 86400),
        ("nan", 86400),
        ("inf", 86400),
        ("-5", 60),
        ("900000", 604800),
        ("300.0", 300),
        ("900", 900),
    ],
)
def test_preview_lifetime_environment_is_bounded_without_startup_failure(
    monkeypatch: pytest.MonkeyPatch, value: str, expected: int
) -> None:
    monkeypatch.setenv("PREVIEW_TTL_SECONDS", value)
    assert Settings(_env_file=None).preview_ttl_seconds == expected
