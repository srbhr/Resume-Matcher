"""Integration tests for the resume upload endpoint guards.

POST /api/v1/resumes/upload validates: file type → size → empty file →
extractable text. These guards are deterministic (no LLM needed) and exercise
the real resumes router (previously ~18% covered). The empty-extracted-text
guard pins PR #794 (reject image-based / scanned PDFs).
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.routers.resumes import MAX_FILE_SIZE


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestUploadGuards:
    async def test_rejects_unsupported_file_type(self, client):
        async with client:
            resp = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.txt", b"hello", "text/plain")},
            )
        assert resp.status_code == 400
        assert "Invalid file type" in resp.json()["detail"]

    async def test_rejects_empty_file(self, client):
        async with client:
            resp = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.pdf", b"", "application/pdf")},
            )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "Empty file"

    async def test_rejects_oversized_file(self, client):
        oversized = b"x" * (MAX_FILE_SIZE + 1)
        async with client:
            resp = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.pdf", oversized, "application/pdf")},
            )
        assert resp.status_code == 413

    @patch("app.routers.resumes.parse_document", new_callable=AsyncMock)
    async def test_rejects_empty_extracted_text(self, mock_parse, client):
        """#794: a valid-but-image-based PDF parses to empty text → 422,
        and we must NOT persist anything to the database."""
        mock_parse.return_value = "   \n  "  # whitespace only → "no extractable text"
        with patch("app.routers.resumes.db") as mock_db:
            async with client:
                resp = await client.post(
                    "/api/v1/resumes/upload",
                    files={"file": ("scanned.pdf", b"%PDF-1.4 image-only", "application/pdf")},
                )
        assert resp.status_code == 422
        assert "extract text" in resp.json()["detail"].lower()
        mock_db.create_resume_atomic_master.assert_not_called()

    @patch("app.routers.resumes.parse_document", new_callable=AsyncMock)
    async def test_maps_parse_failure_to_422(self, mock_parse, client):
        """A parser exception is surfaced as a generic 422, not a 500."""
        mock_parse.side_effect = RuntimeError("corrupt file")
        async with client:
            resp = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("broken.pdf", b"%PDF-1.4 broken", "application/pdf")},
            )
        assert resp.status_code == 422
        assert "Failed to parse" in resp.json()["detail"]
