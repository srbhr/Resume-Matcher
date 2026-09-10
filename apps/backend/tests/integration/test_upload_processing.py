"""Real API/SQLite coverage for bounded upload processing ownership."""

import asyncio
import copy
import io
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from docx import Document
from httpx import ASGITransport, AsyncClient, Response

from app.database import Database
from app.main import app
from app.routers.resumes import MAX_FILE_SIZE


@pytest.fixture
def client() -> AsyncClient:
    """Return an ASGI client without starting production lifespan migrations."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _docx_bytes(text: str) -> bytes:
    document = Document()
    document.add_paragraph(text)
    stream = io.BytesIO()
    document.save(stream)
    return stream.getvalue()


def _pdf_bytes(text: str = "") -> bytes:
    """Build a small structurally valid one-page PDF without external tools."""
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode() if text else b""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length "
        + str(len(content)).encode()
        + b" >>\nstream\n"
        + content
        + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode())
        pdf.extend(body)
        pdf.extend(b"\nendobj\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode()
    )
    return bytes(pdf)


async def _retry(resume_id: str) -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as request_client:
        return await request_client.post(
            f"/api/v1/resumes/{resume_id}/retry-processing"
        )


async def _delete(resume_id: str) -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as request_client:
        return await request_client.delete(f"/api/v1/resumes/{resume_id}")


async def test_upload_rejects_filename_and_mime_mismatch(
    client: AsyncClient, isolated_db: Database, sample_resume: dict[str, object]
) -> None:
    """A text filename declared as PDF must not reach AI or persistence."""
    with patch(
        "app.routers.resumes.parse_resume_to_json",
        new_callable=AsyncMock,
        return_value=sample_resume,
    ) as parse_json:
        async with client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.txt", b"plain text", "application/pdf")},
            )

    assert response.status_code == 400
    assert response.json()["detail"] == "Upload a valid PDF, DOC, or DOCX file."
    parse_json.assert_not_awaited()
    assert await isolated_db.list_resumes() == []


async def test_upload_stops_reading_after_the_raw_size_boundary(
    client: AsyncClient, isolated_db: Database
) -> None:
    """The route must never request the entire oversized body in one read."""
    from starlette.datastructures import UploadFile as StarletteUploadFile

    requested_sizes: list[int] = []
    original_read = StarletteUploadFile.read

    async def recording_read(self: StarletteUploadFile, size: int = -1) -> bytes:
        requested_sizes.append(size)
        return await original_read(self, size)

    with patch.object(StarletteUploadFile, "read", new=recording_read):
        async with client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={
                    "file": (
                        "large.pdf",
                        b"x" * (MAX_FILE_SIZE + 65_536),
                        "application/pdf",
                    )
                },
            )

    assert response.status_code == 413
    assert requested_sizes
    assert all(0 < size <= 65_536 for size in requested_sizes)
    assert sum(requested_sizes) <= MAX_FILE_SIZE + 1
    assert await isolated_db.list_resumes() == []


@pytest.mark.parametrize(
    ("filename", "content", "content_type"),
    [
        ("broken.pdf", b"%PDF-1.4 broken", "application/pdf"),
        (
            "broken.docx",
            b"PK corrupt",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        ("broken.doc", b"plain text", "application/msword"),
    ],
)
async def test_upload_rejects_malformed_document_containers(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, object],
    filename: str,
    content: bytes,
    content_type: str,
) -> None:
    """Malformed supported containers return one safe error without persistence."""
    with patch(
        "app.routers.resumes.parse_resume_to_json",
        new_callable=AsyncMock,
        return_value=sample_resume,
    ) as parse_json:
        async with client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={"file": (filename, content, content_type)},
            )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Failed to parse document. Please upload a valid PDF, DOC, or DOCX file."
    )
    parse_json.assert_not_awaited()
    assert await isolated_db.list_resumes() == []


async def test_upload_accepts_valid_docx_container(
    client: AsyncClient, isolated_db: Database, sample_resume: dict[str, object]
) -> None:
    """A valid DOCX reaches structured parsing and persists a ready resume."""
    with patch(
        "app.routers.resumes.parse_resume_to_json",
        new_callable=AsyncMock,
        return_value=sample_resume,
    ) as parse_json:
        async with client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={
                    "file": (
                        "resume.docx",
                        _docx_bytes("Ada Lovelace, Python engineer"),
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
            )

    assert response.status_code == 200
    assert response.json()["processing_status"] == "ready"
    parse_json.assert_awaited_once()
    assert len(await isolated_db.list_resumes()) == 1


async def test_upload_accepts_valid_pdf_container(
    client: AsyncClient, isolated_db: Database, sample_resume: dict[str, object]
) -> None:
    """A structurally valid text PDF remains supported by the real converter."""
    with patch(
        "app.routers.resumes.parse_resume_to_json",
        new_callable=AsyncMock,
        return_value=sample_resume,
    ) as parse_json:
        async with client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={
                    "file": (
                        "resume.pdf",
                        _pdf_bytes("Ada Lovelace Python engineer"),
                        "application/pdf",
                    )
                },
            )

    assert response.status_code == 200
    assert response.json()["processing_status"] == "ready"
    parse_json.assert_awaited_once()
    assert len(await isolated_db.list_resumes()) == 1


async def test_upload_rejects_valid_pdf_without_extractable_text(
    client: AsyncClient, isolated_db: Database, sample_resume: dict[str, object]
) -> None:
    """A valid but blank/scanned-style PDF remains an intentional 422 control."""
    with patch(
        "app.routers.resumes.parse_resume_to_json",
        new_callable=AsyncMock,
        return_value=sample_resume,
    ) as parse_json:
        async with client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("scanned.pdf", _pdf_bytes(), "application/pdf")},
            )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Could not extract text from the uploaded file. The document may be "
        "image-based or scanned. Please upload a text-based PDF, DOC, or DOCX "
        "with selectable text, or run OCR first."
    )
    parse_json.assert_not_awaited()
    assert await isolated_db.list_resumes() == []


async def test_upload_rejects_extracted_text_over_prompt_limit(
    client: AsyncClient, isolated_db: Database, sample_resume: dict[str, object]
) -> None:
    """Expanded text over the prompt budget returns 413 before persistence or AI."""
    with patch(
        "app.routers.resumes.parse_resume_to_json",
        new_callable=AsyncMock,
        return_value=sample_resume,
    ) as parse_json:
        async with client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={
                    "file": (
                        "large-text.docx",
                        _docx_bytes("A" * (3 * 1024 * 1024)),
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
            )

    assert response.status_code == 413
    assert response.json()["detail"] == (
        "Document content is too large to process. "
        "Maximum expanded size is 16MB and extracted text is 2MB."
    )
    parse_json.assert_not_awaited()
    assert await isolated_db.list_resumes() == []


async def test_stale_retry_failure_cannot_regress_newer_success(
    isolated_db: Database, sample_resume: dict[str, object]
) -> None:
    """A failed older retry returns conflict after the newer retry commits ready."""
    resume = await isolated_db.create_resume(
        content="# Ada", processing_status="failed"
    )
    first_entered = asyncio.Event()
    release_first = asyncio.Event()
    arrivals = 0

    async def controlled_parser(_markdown: str) -> dict[str, object]:
        nonlocal arrivals
        arrivals += 1
        if arrivals == 1:
            first_entered.set()
            await asyncio.wait_for(release_first.wait(), timeout=5)
            raise RuntimeError("older parse failed late")
        return copy.deepcopy(sample_resume)

    with patch("app.routers.resumes.parse_resume_to_json", new=controlled_parser):
        older = asyncio.create_task(_retry(resume["resume_id"]))
        await asyncio.wait_for(first_entered.wait(), timeout=5)
        newer_response = await asyncio.wait_for(_retry(resume["resume_id"]), timeout=5)
        release_first.set()
        older_response = await asyncio.wait_for(older, timeout=5)

    assert newer_response.status_code == 200
    assert newer_response.json()["processing_status"] == "ready"
    assert older_response.status_code == 409
    assert older_response.json()["detail"] == (
        "Resume processing was superseded by a newer attempt."
    )
    stored = await isolated_db.get_resume(resume["resume_id"])
    assert stored is not None
    assert stored["processing_status"] == "ready"
    assert stored["processed_data"] == sample_resume


async def test_active_retry_failure_wins_over_stale_success(
    isolated_db: Database, sample_resume: dict[str, object]
) -> None:
    """A stale success cannot displace the failure of the latest claimed retry."""
    resume = await isolated_db.create_resume(
        content="# Ada", processing_status="failed"
    )
    first_entered = asyncio.Event()
    release_first = asyncio.Event()
    arrivals = 0

    async def controlled_parser(_markdown: str) -> dict[str, object]:
        nonlocal arrivals
        arrivals += 1
        if arrivals == 1:
            first_entered.set()
            await asyncio.wait_for(release_first.wait(), timeout=5)
            return copy.deepcopy(sample_resume)
        raise RuntimeError("latest parse failed")

    with patch("app.routers.resumes.parse_resume_to_json", new=controlled_parser):
        older = asyncio.create_task(_retry(resume["resume_id"]))
        await asyncio.wait_for(first_entered.wait(), timeout=5)
        newer_response = await asyncio.wait_for(_retry(resume["resume_id"]), timeout=5)
        release_first.set()
        older_response = await asyncio.wait_for(older, timeout=5)

    assert newer_response.status_code == 200
    assert newer_response.json()["processing_status"] == "failed"
    assert older_response.status_code == 409
    stored = await isolated_db.get_resume(resume["resume_id"])
    assert stored is not None
    assert stored["processing_status"] == "failed"
    assert stored["processed_data"] is None


@pytest.mark.parametrize("parser_fails", [False, True])
async def test_delete_during_initial_upload_returns_missing_outcome(
    client: AsyncClient,
    isolated_db: Database,
    sample_resume: dict[str, object],
    parser_fails: bool,
) -> None:
    """Success and failure completion both stop cleanly after exact-row deletion."""
    created_ids: list[str] = []
    original_create = isolated_db.create_resume_atomic_master

    async def capture_create(**kwargs: Any) -> dict[str, Any]:
        row = await original_create(**kwargs)
        created_ids.append(row["resume_id"])
        return row

    async def delete_in_parser(_markdown: str) -> dict[str, object]:
        delete_response = await _delete(created_ids[0])
        assert delete_response.status_code == 200
        if parser_fails:
            raise RuntimeError("parser failed after deletion")
        return copy.deepcopy(sample_resume)

    with (
        patch.object(isolated_db, "create_resume_atomic_master", new=capture_create),
        patch(
            "app.routers.resumes.parse_document",
            new_callable=AsyncMock,
            return_value="# Ada",
        ),
        patch("app.routers.resumes.parse_resume_to_json", new=delete_in_parser),
    ):
        async with client:
            response = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.pdf", b"synthetic", "application/pdf")},
            )

    assert response.status_code == 404
    assert response.json()["detail"] == "Resume was deleted during upload processing."
    assert created_ids
    assert await isolated_db.get_resume(created_ids[0]) is None


@pytest.mark.parametrize("parser_fails", [False, True])
async def test_delete_during_retry_returns_missing_outcome(
    isolated_db: Database,
    sample_resume: dict[str, object],
    parser_fails: bool,
) -> None:
    """Retry success and failure share the same intentional deletion outcome."""
    resume = await isolated_db.create_resume(
        content="# Ada", processing_status="failed"
    )

    async def delete_in_parser(_markdown: str) -> dict[str, object]:
        delete_response = await _delete(resume["resume_id"])
        assert delete_response.status_code == 200
        if parser_fails:
            raise RuntimeError("retry failed after deletion")
        return copy.deepcopy(sample_resume)

    with patch("app.routers.resumes.parse_resume_to_json", new=delete_in_parser):
        response = await asyncio.wait_for(_retry(resume["resume_id"]), timeout=5)

    assert response.status_code == 404
    assert response.json()["detail"] == "Resume was deleted during retry."
    assert await isolated_db.get_resume(resume["resume_id"]) is None


async def test_failed_retry_can_recover_with_a_new_successful_generation(
    isolated_db: Database, sample_resume: dict[str, object]
) -> None:
    """A committed failure releases ownership so a later retry can recover."""
    resume = await isolated_db.create_resume(
        content="# Ada", processing_status="failed"
    )
    parser = AsyncMock(
        side_effect=[RuntimeError("first attempt failed"), copy.deepcopy(sample_resume)]
    )

    with patch("app.routers.resumes.parse_resume_to_json", new=parser):
        failed = await asyncio.wait_for(_retry(resume["resume_id"]), timeout=5)
        recovered = await asyncio.wait_for(_retry(resume["resume_id"]), timeout=5)

    assert failed.status_code == 200
    assert failed.json()["processing_status"] == "failed"
    assert recovered.status_code == 200
    assert recovered.json()["processing_status"] == "ready"
    stored = await isolated_db.get_resume(resume["resume_id"])
    assert stored is not None
    assert stored["processing_status"] == "ready"
    assert stored["processed_data"] == sample_resume


async def test_docx_expansion_limit_returns_413(client: AsyncClient) -> None:
    document = _docx_bytes("A" * (17 * 1024 * 1024))
    response = await client.post(
        "/api/v1/resumes/upload",
        files={
            "file": (
                "large.docx",
                document,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert response.status_code == 413
