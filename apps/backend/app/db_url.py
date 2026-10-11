"""DATABASE_URL and DATABASE_SCHEMA parsing for the optional PostgreSQL backend."""

import re

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

POSTGRES_DRIVER = "postgresql+psycopg"
_POSTGRES_SCHEMES = ("postgres", "postgresql", POSTGRES_DRIVER)
_SCHEMA_RE = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
# libpq accepts these as query parameters; ``hide_password`` only masks the userinfo.
_SECRET_QUERY_KEYS = frozenset({"password", "sslpassword"})
_INVALID_URL = "DATABASE_URL is not a valid URL."


def normalize_database_url(url: str) -> str:
    """Return the psycopg URL for a PostgreSQL URL. Errors never echo the URL."""
    scheme, sep, rest = url.strip().partition("://")
    if not sep or scheme.lower() not in _POSTGRES_SCHEMES:
        raise ValueError(
            "DATABASE_URL must be a postgresql:// URL. Unset it to use SQLite."
        )
    normalized = f"{POSTGRES_DRIVER}://{rest}"
    try:
        make_url(normalized)
    except (ArgumentError, ValueError):
        # ``from None``: the parse error can carry the URL, so it must not be chained.
        # make_url raises a bare ValueError for a bad port.
        raise ValueError(_INVALID_URL) from None
    return normalized


def validate_schema_name(name: str) -> str:
    if not _SCHEMA_RE.fullmatch(name):
        raise ValueError(
            "DATABASE_SCHEMA must be lowercase letters, digits or _, up to 63 characters."
        )
    return name


def redact(url: str) -> str:
    """Render a URL for logs with the password, in userinfo or query, masked."""
    try:
        parsed = make_url(url)
    except (ArgumentError, ValueError):
        raise ValueError(_INVALID_URL) from None
    query = {
        key: "redacted" if key.lower() in _SECRET_QUERY_KEYS else value
        for key, value in parsed.query.items()
    }
    return parsed.set(query=query).render_as_string(hide_password=True)
