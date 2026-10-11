"""MCP server: deterministic tools over an in-memory client, plus stdio hygiene."""

import copy
import importlib
import json
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import pytest
from docx import Document
from httpx import ASGITransport, AsyncClient
from mcp import Client

from app.config import settings
from app.database import MAX_MASTER_RESUMES, Database
from app.main import app
from app.mcp_server import tools
from app.mcp_server.server import build_server
from app.pdf import PDFRenderError
from app.routers import resumes as resumes_router
from app.routers.resumes import _hash_job_content
from app.services import ats_parse
from tests.ats_fixtures import john_doe, render
from tests.unit.test_page_fit import _pdf

pytestmark = pytest.mark.integration

export_module = importlib.import_module("app.mcp_server.tools.export_resume_pdf")
shared_module = importlib.import_module("app.mcp_server.tools._shared")

EXPECTED_TOOLS = {
    "get_status",
    "get_resume_schema",
    "list_resumes",
    "get_resume",
    "get_job",
    "get_resume_job",
    "extract_document_text",
    "validate_tailored_resume",
    "score_resume",
    "parse_check_file",
    "parse_check_resume",
    "verify_resume",
    "list_applications",
    "create_master_resume",
    "update_resume",
    "set_resume_title",
    "set_cover_letter",
    "set_outreach_message",
    "set_default_master",
    "add_job",
    "set_job_keywords",
    "save_tailored_resume",
    "tailor_and_verify",
    "export_resume_pdf",
    "create_application",
    "update_application",
}


@asynccontextmanager
async def connect() -> AsyncIterator[Client]:
    async with Client(build_server()) as client:
        yield client


async def call(client: Client, name: str, args: dict[str, Any] | None = None) -> Any:
    result = await client.call_tool(name, args or {})
    assert not result.is_error, result.content
    return result.structured_content


async def call_error(client: Client, name: str, args: dict[str, Any]) -> str:
    result = await client.call_tool(name, args)
    assert result.is_error
    return " ".join(getattr(block, "text", "") for block in result.content)


async def _master(client: Client, resume: dict[str, Any]) -> dict[str, Any]:
    created = await call(client, "create_master_resume", {"resume_data": resume})
    return await call(client, "get_resume", {"resume_id": created["resume_id"]})


async def _job(client: Client, description: str, keywords: dict[str, Any]) -> str:
    job = await call(
        client,
        "add_job",
        {
            "job_description": description,
            "keywords": {**keywords, "company": "TechCorp"},
        },
    )
    return job["job_id"]


async def test_exposes_exactly_the_deterministic_tool_set() -> None:
    async with connect() as mcp:
        listed = await mcp.list_tools()
        names = {tool.name for tool in listed.tools}
        assert names == EXPECTED_TOOLS
        assert not any(
            word in n for n in names for word in ("delete", "config", "reset")
        )
        read_only = {t.name for t in listed.tools if t.annotations.read_only_hint}
        assert read_only == {fn.__name__ for fn in tools.READ_ONLY_TOOLS}


async def test_master_round_trip_is_visible_to_the_web_api(
    sample_resume: dict[str, Any],
) -> None:
    async with connect() as mcp:
        master = await _master(mcp, sample_resume)
        assert master["is_master"] and master["is_default_master"]
        assert master["title"] == "Jane Doe Master Resume"
        assert master["resume_data"]["sectionMeta"], "defaults filled for new resumes"

        edited = copy.deepcopy(master["resume_data"])
        edited["summary"] = "Python API engineer."
        await call(
            mcp,
            "update_resume",
            {"resume_id": master["resume_id"], "resume_data": edited},
        )

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as c:
            res = await c.get(
                "/api/v1/resumes", params={"resume_id": master["resume_id"]}
            )
        assert (
            res.json()["data"]["processed_resume"]["summary"] == "Python API engineer."
        )


async def test_create_master_requires_name_and_respects_limit(
    sample_resume: dict[str, Any],
) -> None:
    async with connect() as mcp:
        nameless = copy.deepcopy(sample_resume)
        nameless["personalInfo"]["name"] = " "
        assert "name is required" in await call_error(
            mcp, "create_master_resume", {"resume_data": nameless}
        )
        for _ in range(MAX_MASTER_RESUMES):
            await call(mcp, "create_master_resume", {"resume_data": sample_resume})
        message = await call_error(
            mcp, "create_master_resume", {"resume_data": sample_resume}
        )
        assert f"limit reached ({MAX_MASTER_RESUMES})" in message


async def test_add_job_caches_keywords_under_the_pipeline_hash(
    isolated_db: Database,
    sample_job_description: str,
    sample_job_keywords: dict[str, Any],
) -> None:
    async with connect() as mcp:
        job_id = await _job(mcp, sample_job_description, sample_job_keywords)
        stored = await isolated_db.get_job(job_id)
        assert stored["job_keywords_hash"] == _hash_job_content(stored["content"])
        assert (
            stored["job_keywords"]["required_skills"]
            == sample_job_keywords["required_skills"]
        )
        assert stored["company"] == "TechCorp"


async def test_save_tailored_rejects_dropped_entries_and_identity_changes(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    sample_job_description: str,
    sample_job_keywords: dict[str, Any],
) -> None:
    async with connect() as mcp:
        master = await _master(mcp, sample_resume)
        job_id = await _job(mcp, sample_job_description, sample_job_keywords)

        dropped = copy.deepcopy(master["resume_data"])
        dropped["workExperience"].pop()
        renamed = copy.deepcopy(master["resume_data"])
        renamed["personalInfo"]["email"] = "someone@else.com"

        for candidate, expected in (
            (dropped, "workExperience"),
            (renamed, "personalInfo"),
        ):
            args = {"source_resume_id": master["resume_id"], "resume_data": candidate}
            report = await call(mcp, "validate_tailored_resume", args)
            assert not report["valid"]
            assert any(expected in v for v in report["violations"])
            message = await call_error(
                mcp, "save_tailored_resume", {**args, "job_id": job_id}
            )
            assert "rejected" in message
        assert len(await isolated_db.list_resumes()) == 1


async def test_validate_flags_invented_metrics(sample_resume: dict[str, Any]) -> None:
    async with connect() as mcp:
        master = await _master(mcp, sample_resume)
        padded = copy.deepcopy(master["resume_data"])
        padded["workExperience"][0]["description"][1] += ", cutting latency by 73%"
        report = await call(
            mcp,
            "validate_tailored_resume",
            {"source_resume_id": master["resume_id"], "resume_data": padded},
        )
        assert not report["valid"]
        assert "workExperience[0].description[1]" in report["violations"][0]
        assert "73%" not in json.dumps(report["repaired_resume_data"])


async def test_save_tailored_links_job_and_creates_tracker_card(
    sample_resume: dict[str, Any],
    sample_job_description: str,
    sample_job_keywords: dict[str, Any],
) -> None:
    async with connect() as mcp:
        master = await _master(mcp, sample_resume)
        job_id = await _job(mcp, sample_job_description, sample_job_keywords)
        tailored = copy.deepcopy(master["resume_data"])
        tailored["summary"] = (
            "Backend engineer with 6 years of experience building scalable Python "
            "FastAPI microservices."
        )
        tailored["workExperience"][0]["description"].reverse()

        saved = await call(
            mcp,
            "save_tailored_resume",
            {
                "source_resume_id": master["resume_id"],
                "job_id": job_id,
                "resume_data": tailored,
                "title": "TechCorp Backend",
            },
        )
        assert saved["parent_id"] == master["resume_id"] and not saved["is_master"]
        linked = await call(mcp, "get_resume_job", {"resume_id": saved["resume_id"]})
        assert (
            linked["job_id"] == job_id
            and linked["source_resume_id"] == master["resume_id"]
        )

        cards = (await call(mcp, "list_applications"))["applications"]
        assert [c["application_id"] for c in cards] == [saved["application_id"]]
        assert (
            cards[0]["company"] == "TechCorp" and cards[0]["role"] == "TechCorp Backend"
        )

        moved = await call(
            mcp,
            "update_application",
            {"application_id": saved["application_id"], "status": "interview"},
        )
        assert moved["status"] == "interview"


async def test_score_resume_reports_missing_keywords(
    sample_resume: dict[str, Any],
    sample_job_description: str,
    sample_job_keywords: dict[str, Any],
) -> None:
    async with connect() as mcp:
        master = await _master(mcp, sample_resume)
        job_id = await _job(mcp, sample_job_description, sample_job_keywords)
        score = await call(
            mcp, "score_resume", {"resume_id": master["resume_id"], "job_id": job_id}
        )
        assert 0 < score["keyword_match_percentage"] < 100
        assert "Kubernetes" in score["missing_keywords"]
        assert 0 < score["overall_score"] <= 100


async def test_export_pdf_writes_file_with_the_route_print_url(
    sample_resume: dict[str, Any],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with connect() as mcp:
        master = await _master(mcp, sample_resume)
        mcp_render = AsyncMock(return_value=_pdf(2))
        route_render = AsyncMock(return_value=_pdf(2))
        monkeypatch.setattr(export_module, "render_resume_pdf", mcp_render)
        monkeypatch.setattr(resumes_router, "render_resume_pdf", route_render)
        options = {
            "template": "modern",
            "pageSize": "LETTER",
            "marginTop": 15,
            "compactMode": True,
            "accentColor": "green",
            "lang": "en",
        }

        out = tmp_path / "cv.pdf"
        result = await call(
            mcp,
            "export_resume_pdf",
            {
                "resume_id": master["resume_id"],
                "output_path": str(out),
                "print_settings": options,
            },
        )
        assert result["page_count"] == 2 and out.read_bytes() == _pdf(2)

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as c:
            res = await c.get(
                f"/api/v1/resumes/{master['resume_id']}/pdf", params=options
            )
        assert res.status_code == 200
        mcp_url = urlsplit(mcp_render.await_args.args[0])
        route_url = urlsplit(route_render.await_args.args[0])
        assert mcp_url.path == route_url.path
        assert parse_qs(mcp_url.query) == parse_qs(route_url.query)
        assert (
            mcp_render.await_args.kwargs["margins"]
            == route_render.await_args.kwargs["margins"]
        )


async def test_export_pdf_render_failure_points_at_frontend(
    sample_resume: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    async with connect() as mcp:
        master = await _master(mcp, sample_resume)
        monkeypatch.setattr(
            export_module,
            "render_resume_pdf",
            AsyncMock(side_effect=PDFRenderError("boom")),
        )
        message = await call_error(
            mcp, "export_resume_pdf", {"resume_id": master["resume_id"]}
        )
        assert "frontend is running" in message and "boom" not in message


async def test_extract_document_text_reads_docx(tmp_path: Path) -> None:
    async with connect() as mcp:
        document = Document()
        document.add_paragraph("Jane Doe - Backend Engineer")
        path = tmp_path / "resume.docx"
        document.save(path)
        result = await call(mcp, "extract_document_text", {"file_path": str(path)})
        assert "Jane Doe - Backend Engineer" in result["markdown"]
        assert "Unsupported" in await call_error(
            mcp, "extract_document_text", {"file_path": str(tmp_path / "x.exe")}
        )


def test_stdio_stdout_carries_only_protocol_messages(tmp_path: Path) -> None:
    initialize = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "0"},
        },
    }
    proc = subprocess.run(
        [sys.executable, "-m", "app.mcp_server"],
        input=json.dumps(initialize) + "\n",
        capture_output=True,
        text=True,
        timeout=60,
        env={**os.environ, "DATA_DIR": str(tmp_path / "data")},
        cwd=Path(__file__).resolve().parents[2],
    )
    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    assert lines, proc.stderr
    for line in lines:
        assert json.loads(line)["jsonrpc"] == "2.0"
    assert json.loads(lines[0])["result"]["serverInfo"]["name"] == "resume-matcher"


async def test_parse_check_resume_renders_in_memory(
    monkeypatch: pytest.MonkeyPatch, isolated_db: Database
) -> None:
    async with connect() as mcp:
        created = await call(mcp, "create_master_resume", {"resume_data": john_doe()})
        rendered = AsyncMock(return_value=render("single-column"))
        monkeypatch.setattr(ats_parse, "render_resume_pdf", rendered)
        report = await call(
            mcp,
            "parse_check_resume",
            {
                "resume_id": created["resume_id"],
                "print_settings": {"template": "clean"},
            },
        )
    assert report["source"] == "render" and report["template"] == "clean"
    assert report["roundtrip"]["content_recall"] == 1.0
    assert "template=clean" in rendered.await_args.args[0]
    assert not (settings.data_dir / "exports").exists()


async def test_parse_check_file(tmp_path: Path) -> None:
    path = tmp_path / "cv.pdf"
    path.write_bytes(render("two-column"))
    async with connect() as mcp:
        report = await call(mcp, "parse_check_file", {"file_path": str(path)})
        rejected = await call_error(
            mcp, "parse_check_file", {"file_path": str(tmp_path / "cv.doc")}
        )
    statuses = {c["id"]: c["status"] for c in report["checks"]}
    assert statuses["multi_column"] == "fail"
    assert "Unsupported" in rejected


async def _john_doe_job(mcp: Client) -> tuple[dict[str, Any], str]:
    master = await _master(mcp, john_doe())
    job_id = await _job(
        mcp,
        "Senior Python engineer: FastAPI, PostgreSQL, Kubernetes.",
        {"required_skills": ["Python", "FastAPI", "Kubernetes"]},
    )
    return master, job_id


async def test_tailor_and_verify_rejects_without_writing(
    isolated_db: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    rendered = AsyncMock(return_value=render("single-column"))
    monkeypatch.setattr(shared_module, "render_resume_pdf", rendered)
    async with connect() as mcp:
        master, job_id = await _john_doe_job(mcp)
        dropped = copy.deepcopy(master["resume_data"])
        dropped["workExperience"].pop()
        result = await call(
            mcp,
            "tailor_and_verify",
            {
                "source_resume_id": master["resume_id"],
                "job_id": job_id,
                "resume_data": dropped,
            },
        )
    assert result["saved"] is False and not result["validation"]["valid"]
    assert any("workExperience" in v for v in result["validation"]["violations"])
    assert len(await isolated_db.list_resumes()) == 1
    assert await isolated_db.list_applications() == []
    rendered.assert_not_awaited()


async def test_tailor_and_verify_saves_renders_once_and_reports_issues(
    isolated_db: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    rendered = AsyncMock(return_value=render("two-column"))
    monkeypatch.setattr(shared_module, "render_resume_pdf", rendered)
    async with connect() as mcp:
        master, job_id = await _john_doe_job(mcp)
        result = await call(
            mcp,
            "tailor_and_verify",
            {
                "source_resume_id": master["resume_id"],
                "job_id": job_id,
                "resume_data": master["resume_data"],
                "print_settings": {"template": "swiss-two-column"},
            },
        )
        linked = await call(
            mcp, "get_resume_job", {"resume_id": result["resume"]["resume_id"]}
        )
    assert result["saved"] is True and result["validation"]["valid"]
    assert linked["job_id"] == job_id
    assert result["resume"]["application_id"]
    assert len(await isolated_db.list_applications()) == 1
    assert result["score"]["keyword_match_percentage"] > 0
    assert result["page_count"] == 1
    assert result["parse_check"]["template"] == "swiss-two-column"
    assert {"multi_column", "low_order_fidelity"} <= set(result["issues"])
    rendered.assert_awaited_once()
    assert "template=swiss-two-column" in rendered.await_args.args[0]


async def test_verify_resume_flags_page_limit_and_writes_nothing(
    isolated_db: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        shared_module, "render_resume_pdf", AsyncMock(return_value=_pdf(3))
    )
    async with connect() as mcp:
        master = await _master(mcp, john_doe())
        result = await call(
            mcp, "verify_resume", {"resume_id": master["resume_id"], "max_pages": 1}
        )
    assert result["page_count"] == 3 and "over_page_limit" in result["issues"]
    assert result["job_id"] is None and result["score"] is None
    assert len(await isolated_db.list_resumes()) == 1
    assert not (settings.data_dir / "exports").exists()


async def test_verify_resume_render_failure_still_scores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        shared_module,
        "render_resume_pdf",
        AsyncMock(side_effect=PDFRenderError("chromium detail")),
    )
    async with connect() as mcp:
        master, job_id = await _john_doe_job(mcp)
        result = await call(
            mcp,
            "tailor_and_verify",
            {
                "source_resume_id": master["resume_id"],
                "job_id": job_id,
                "resume_data": master["resume_data"],
            },
        )
    assert result["saved"] is True and result["issues"][0] == "render_failed"
    assert "frontend is running" in result["render_error"]
    assert "chromium detail" not in json.dumps(result)
    assert result["score"] is not None and result["parse_check"] is None


async def test_verify_resume_uses_the_pdf_route_print_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mcp_render = AsyncMock(return_value=render("single-column"))
    route_render = AsyncMock(return_value=render("single-column"))
    monkeypatch.setattr(shared_module, "render_resume_pdf", mcp_render)
    monkeypatch.setattr(resumes_router, "render_resume_pdf", route_render)
    options = {
        "template": "modern",
        "pageSize": "LETTER",
        "marginTop": 15,
        "lang": "en",
    }
    async with connect() as mcp:
        master = await _master(mcp, john_doe())
        await call(
            mcp,
            "verify_resume",
            {"resume_id": master["resume_id"], "print_settings": options},
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as c:
            res = await c.get(
                f"/api/v1/resumes/{master['resume_id']}/pdf", params=options
            )
    assert res.status_code == 200
    mcp_url = urlsplit(mcp_render.await_args.args[0])
    route_url = urlsplit(route_render.await_args.args[0])
    assert mcp_url.path == route_url.path
    assert parse_qs(mcp_url.query) == parse_qs(route_url.query)
    assert mcp_render.await_args.kwargs == route_render.await_args.kwargs
