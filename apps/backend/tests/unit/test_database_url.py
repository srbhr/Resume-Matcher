"""PostgreSQL configuration and write locking, checked without a server."""

from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import OperationalError
from sqlalchemy.schema import CreateIndex

from app import database as database_module
from app.config import Settings
from app.database import (
    Database,
    DatabaseBusyError,
    _translate_write_errors,
    _write_lock_statements,
)
from app.db_url import normalize_database_url, redact, validate_schema_name
from app.models import Resume
from app.scripts.copy_sqlite_to_postgres import TargetNotEmptyError, copy_rows

pytestmark = pytest.mark.unit

PG = "postgresql+psycopg://rm:s3cret@db:5432/rm"


@pytest.mark.parametrize(
    "url", ["postgres://rm:s3cret@db:5432/rm", "postgresql://rm:s3cret@db:5432/rm", PG]
)
def test_postgres_urls_use_psycopg(url: str) -> None:
    assert normalize_database_url(url) == PG


@pytest.mark.parametrize(
    "url", ["mysql://rm:s3cret@db/rm", "sqlite:///data/rm.db", "s3cret"]
)
def test_other_urls_are_rejected_without_echoing_them(url: str) -> None:
    with pytest.raises(ValidationError) as error:
        Settings(database_url=url)
    assert "s3cret" not in str(error.value)


def test_blank_database_settings_mean_sqlite() -> None:
    settings = Settings(database_url="  ", database_schema="")
    assert settings.database_url is None and settings.database_schema is None


@pytest.mark.parametrize("name", ["Upper", "has-dash", "1st", "x" * 64, 'a"; drop'])
def test_schema_names_are_strict(name: str) -> None:
    with pytest.raises(ValueError):
        validate_schema_name(name)
    assert validate_schema_name("rm_tenant_1") == "rm_tenant_1"


def test_redact_hides_the_password() -> None:
    assert "s3cret" not in redact(PG) and "rm:***@db" in redact(PG)


def test_database_url_selects_postgres_unless_a_path_is_given(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(database_module.settings, "database_url", PG)
    monkeypatch.setattr(database_module.settings, "database_schema", "tenant")
    pg = Database()
    assert (pg.backend, pg.url, pg.schema, pg.db_path) == (
        "postgresql",
        PG,
        "tenant",
        None,
    )
    assert Database(db_path=tmp_path / "a.db").backend == "sqlite"


def test_postgres_writer_takes_a_timed_advisory_lock() -> None:
    sqlite = [str(s) for s in _write_lock_statements(False, 5000)]
    pg = [
        str(s.compile(dialect=postgresql.dialect()))
        for s in _write_lock_statements(True, 10)
    ]
    assert sqlite == ["BEGIN IMMEDIATE"]
    assert pg[0] == "SET LOCAL lock_timeout = 10"
    assert "pg_advisory_xact_lock" in pg[1] and "current_schema()" in pg[1]


class _PgError(Exception):
    def __init__(self, sqlstate: str) -> None:
        self.sqlstate = sqlstate


@pytest.mark.parametrize("sqlstate", ["55P03", "40001", "40P01"])
def test_postgres_contention_is_retryable(sqlstate: str) -> None:
    with pytest.raises(DatabaseBusyError):
        with _translate_write_errors():
            raise OperationalError("SELECT 1", {}, _PgError(sqlstate))


def test_other_postgres_errors_are_not_retryable() -> None:
    with pytest.raises(OperationalError):
        with _translate_write_errors():
            raise OperationalError("SELECT 1", {}, _PgError("08006"))


def test_default_master_index_is_partial_on_postgres() -> None:
    index = next(
        i
        for i in Resume.__table__.indexes
        if i.name == "ux_resumes_single_default_master"
    )
    ddl = str(CreateIndex(index).compile(dialect=postgresql.dialect()))
    assert "WHERE is_default_master" in ddl


async def test_copy_rows_copies_every_table_once(tmp_path: Path) -> None:
    source = Database(db_path=tmp_path / "source.db")
    target = Database(db_path=tmp_path / "target.db")
    try:
        resume = await source.create_resume(
            content="x", processed_data={"summary": "s"}, processing_status="ready"
        )
        job = await source.create_job("Engineer", resume["resume_id"])
        await source.create_application(job_id=job["job_id"], resume_id="r1")
        source.set_api_key_ciphertext("openai", "ciphertext")

        counts = copy_rows(source, target)
        assert counts["resumes"] == counts["jobs"] == counts["applications"] == 1
        assert counts["api_keys"] == 1
        assert await target.get_resume(resume["resume_id"]) == await source.get_resume(
            resume["resume_id"]
        )
        assert target.get_api_key_ciphertexts() == {"openai": "ciphertext"}
        with pytest.raises(TargetNotEmptyError):
            copy_rows(source, target)
        assert (await target.get_stats())["total_resumes"] == 1
    finally:
        await source.close()
        await target.close()
