"""resume-matcher CLI: argument parsing and calls through the MCP tools."""

import io
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from app.database import Database
from app.mcp_server import tools
from app.mcp_server.cli import UsageError, parse_arguments, run

pytestmark = pytest.mark.integration


async def cli(*args: str, stdin: str = "") -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    code = await run(list(args), io.StringIO(stdin), out, err)
    return code, out.getvalue(), err.getvalue()


class TestParseArguments:
    def test_no_tokens_is_no_arguments(self) -> None:
        assert parse_arguments([], io.StringIO()) == {}

    def test_inline_json_object(self) -> None:
        assert parse_arguments(['{"a": 1, "b": "x=y"}'], io.StringIO()) == {
            "a": 1,
            "b": "x=y",
        }

    def test_json_object_from_file_and_stdin(self, tmp_path: Path) -> None:
        args = tmp_path / "args.json"
        args.write_text('{"resume_id": "r1"}', encoding="utf-8")
        assert parse_arguments([f"@{args}"], io.StringIO()) == {"resume_id": "r1"}
        assert parse_arguments(["-"], io.StringIO('{"job_id": "j1"}')) == {
            "job_id": "j1"
        }

    def test_fields(self, tmp_path: Path) -> None:
        jd = tmp_path / "job.md"
        jd.write_text("Senior engineer\nRust = required", encoding="utf-8")
        keywords = tmp_path / "keywords.json"
        keywords.write_text('{"required_skills": ["Rust"]}', encoding="utf-8")
        parsed = parse_arguments(
            [
                "company=Acme Inc",
                f"job_description=@{jd}",
                f"keywords:=@{keywords}",
                "max_pages:=2",
                "track_application:=false",
                "title=a=b",
            ],
            io.StringIO(),
        )
        assert parsed == {
            "company": "Acme Inc",
            "job_description": "Senior engineer\nRust = required",
            "keywords": {"required_skills": ["Rust"]},
            "max_pages": 2,
            "track_application": False,
            "title": "a=b",
        }

    @pytest.mark.parametrize(
        "tokens",
        [
            ["[1, 2]"],
            ["{not json"],
            ["a=1", "a=2"],
            ["a=1", "loose"],
            ["n:=nope"],
            ["file=@/no/such/file.md"],
        ],
    )
    def test_rejects_bad_command_lines(self, tokens: list[str]) -> None:
        with pytest.raises(UsageError):
            parse_arguments(tokens, io.StringIO())


async def test_help_lists_every_tool() -> None:
    code, out, _ = await cli("--help")
    assert code == 0
    every_tool = tools.READ_ONLY_TOOLS + tools.ADDITIVE_TOOLS + tools.DESTRUCTIVE_TOOLS
    listed = {line.split()[0] for line in out.split("Tools:\n", 1)[1].splitlines()}
    assert listed == {fn.__name__ for fn in every_tool}


async def test_tool_help_shows_the_argument_schema() -> None:
    code, out, _ = await cli("add-job", "--help")
    assert code == 0
    schema = json.loads(out.split("Arguments (JSON schema):\n", 1)[1])
    assert schema["required"] == ["job_description"]


async def test_creates_and_reads_a_resume_like_the_mcp_tools(
    isolated_db: Database, sample_resume: dict[str, Any], tmp_path: Path
) -> None:
    args = tmp_path / "master.json"
    args.write_text(json.dumps({"resume_data": sample_resume}), encoding="utf-8")
    code, out, err = await cli("create_master_resume", f"@{args}")
    assert code == 0, err
    resume_id = json.loads(out)["resume_id"]

    stored = await isolated_db.get_resume(resume_id)
    assert stored["is_master"] is True

    code, out, _ = await cli("get-resume", f"resume_id={resume_id}")
    assert code == 0
    assert json.loads(out)["resume_id"] == resume_id


async def test_adds_a_job_description_from_a_file(
    isolated_db: Database, tmp_path: Path
) -> None:
    jd = tmp_path / "acme.md"
    jd.write_text("# Platform Engineer\nKubernetes and Go.", encoding="utf-8")
    code, out, err = await cli(
        "add_job", f"job_description=@{jd}", "company=Acme", "role=Platform Engineer"
    )
    assert code == 0, err
    job = await isolated_db.get_job(json.loads(out)["job_id"])
    assert job["content"] == "# Platform Engineer\nKubernetes and Go."
    assert job["company"] == "Acme"


async def test_tool_errors_exit_1_on_stderr() -> None:
    code, out, err = await cli("get_resume", "resume_id=missing")
    assert (code, out) == (1, "")
    assert "Resume not found" in err


async def test_invalid_arguments_exit_1() -> None:
    code, _, err = await cli("get_resume")
    assert code == 1
    assert "resume_id" in err


@pytest.mark.parametrize(
    ("args", "message"),
    [(["delete_everything"], "unknown tool"), (["get_resume", "x"], "key=value")],
)
async def test_bad_command_lines_exit_2(args: list[str], message: str) -> None:
    code, out, err = await cli(*args)
    assert (code, out) == (2, "")
    assert message in err


def test_console_script_prints_only_json(tmp_path: Path) -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "app.mcp_server.cli", "get_status"],
        capture_output=True,
        text=True,
        timeout=60,
        env={**os.environ, "DATA_DIR": str(tmp_path / "data")},
        cwd=Path(__file__).resolve().parents[2],
    )
    assert proc.returncode == 0, proc.stderr
    assert json.loads(proc.stdout)["master_resumes"] == 0
