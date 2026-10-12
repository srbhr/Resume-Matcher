"""Upload and PDF-download failure paths reported by users."""

import json
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from playwright.async_api import Error as PlaywrightError

from app.database import Database
from app.main import app
from app.pdf import PRINT_ERROR_SELECTOR, PDFRenderError, _raise_playwright_error
from app.routers import resumes as resumes_router
from app.routers.resumes import PASSWORD_PDF_DETAIL, UNPARSED_RESUME_PDF_DETAIL
from app.services.parser import DocumentPasswordError

DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.parametrize("filename", ["resume.docx", "resume.pdf"])
@pytest.mark.parametrize("content_type", ["application/octet-stream", ""])
async def test_upload_accepts_a_known_extension_without_a_browser_mime_type(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    filename: str,
    content_type: str,
) -> None:
    with (
        patch(
            "app.routers.resumes.parse_document",
            new_callable=AsyncMock,
            return_value="# Jane Doe",
        ) as convert,
        patch(
            "app.routers.resumes.parse_resume_to_json",
            new_callable=AsyncMock,
            return_value=sample_resume,
        ),
    ):
        async with _client() as client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={"file": (filename, b"bytes", content_type)},
            )

    assert response.status_code == 200, response.text
    convert.assert_awaited_once()


async def test_upload_still_rejects_an_unknown_type_without_a_mime_type(
    isolated_db: Database,
) -> None:
    async with _client() as client:
        response = await client.post(
            "/api/v1/resumes/upload",
            files={"file": ("resume.txt", b"bytes", "application/octet-stream")},
        )
    assert response.status_code == 400


async def test_password_protected_pdf_gets_a_clear_message(
    isolated_db: Database,
) -> None:
    with patch(
        "app.routers.resumes.parse_document",
        new_callable=AsyncMock,
        side_effect=DocumentPasswordError("locked"),
    ):
        async with _client() as client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.pdf", b"%PDF", "application/pdf")},
            )
    assert response.status_code == 422
    assert response.json()["detail"] == PASSWORD_PDF_DETAIL
    assert await isolated_db.list_resumes() == []


async def test_pdf_of_an_unparsed_resume_fails_fast_without_rendering(
    isolated_db: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    resume = await isolated_db.create_resume(
        content="# Jane Doe\n\nMarkdown only", processing_status="failed"
    )
    render = AsyncMock(return_value=b"%PDF")
    monkeypatch.setattr(resumes_router, "render_resume_pdf", render)
    async with _client() as client:
        response = await client.get(f"/api/v1/resumes/{resume['resume_id']}/pdf")

    assert response.status_code == 409
    assert response.json()["detail"] == UNPARSED_RESUME_PDF_DETAIL
    render.assert_not_awaited()


async def test_pdf_renders_a_builder_saved_resume_without_processed_data(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resume = await isolated_db.create_resume(
        content=json.dumps(sample_resume), content_type="json"
    )
    render = AsyncMock(return_value=b"%PDF")
    monkeypatch.setattr(resumes_router, "render_resume_pdf", render)
    async with _client() as client:
        response = await client.get(f"/api/v1/resumes/{resume['resume_id']}/pdf")

    assert response.status_code == 200
    render.assert_awaited_once()
    # The default selector stops on the print page's error marker.
    assert "selector" not in render.await_args.kwargs


async def test_resume_render_waits_for_the_print_error_marker_by_default() -> None:
    import inspect

    from app.pdf import render_resume_pdf

    default = inspect.signature(render_resume_pdf).parameters["selector"].default
    assert ".resume-print" in default
    assert PRINT_ERROR_SELECTOR in default


async def test_cover_letter_render_waits_for_the_print_error_marker(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resume = await isolated_db.create_resume(
        content="# Resume",
        processed_data=sample_resume,
        processing_status="ready",
        cover_letter="Dear team,",
    )
    render = AsyncMock(return_value=b"%PDF")
    monkeypatch.setattr(resumes_router, "render_resume_pdf", render)
    async with _client() as client:
        response = await client.get(
            f"/api/v1/resumes/{resume['resume_id']}/cover-letter/pdf"
        )

    assert response.status_code == 200
    assert PRINT_ERROR_SELECTOR in render.await_args.kwargs["selector"]


def test_missing_chromium_system_libraries_get_an_actionable_message() -> None:
    error = PlaywrightError(
        "BrowserType.launch: \nHost system is missing dependencies to run browsers."
    )
    with pytest.raises(PDFRenderError, match="playwright install-deps"):
        _raise_playwright_error(error, "http://localhost:3000/print/resumes/x")
