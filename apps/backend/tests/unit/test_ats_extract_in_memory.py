"""The ATS parse check validates an upload in memory (PR #1042 review)."""

import io
import tempfile
from typing import Any

import pytest
from docx import Document

from app.services.ats_parse.extract import _extract_sync
from app.services.parser import DocumentValidationError
from tests.unit.test_page_fit import _pdf


def _docx_bytes() -> bytes:
    document = Document()
    document.add_paragraph("Jane Doe")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


@pytest.fixture
def no_temp_files(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("the upload must not be written to a temp file")

    for name in ("NamedTemporaryFile", "TemporaryFile", "mkstemp", "mkdtemp"):
        monkeypatch.setattr(tempfile, name, forbidden)


@pytest.mark.parametrize("kind", ["docx", "pdf"])
def test_upload_is_validated_without_a_temp_file(
    no_temp_files: None, kind: str
) -> None:
    content = _docx_bytes() if kind == "docx" else _pdf(1)

    assert _extract_sync(content, f"cv.{kind}").kind == kind


@pytest.mark.parametrize("filename", ["cv.docx", "cv.pdf"])
def test_invalid_upload_is_still_rejected(no_temp_files: None, filename: str) -> None:
    with pytest.raises(DocumentValidationError):
        _extract_sync(b"not a document", filename)
