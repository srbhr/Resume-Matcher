"""ATS-style text extraction with layout data, run under the parser's bounded worker."""

import io
import logging
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from docx import Document
from pdfminer.high_level import extract_pages
from pdfminer.layout import LAParams, LTContainer, LTFigure, LTImage, LTTextContainer
from pdfminer.pdfpage import PDFPage

from app.services.parser import (
    DocumentValidationError,
    _validate_docx_container,
    _validate_extracted_text,
    _validate_pdf_container,
    run_bounded_document_job,
)

MAX_PARSE_CHECK_PAGES = 10
SUPPORTED_SUFFIXES = (".pdf", ".docx")

# pdfminer warns per glyph on Chromium fonts ("Could not get FontBBox").
logging.getLogger("pdfminer").setLevel(logging.ERROR)


@dataclass
class TextBox:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str


@dataclass
class PageLayout:
    width: float
    height: float
    boxes: list[TextBox]
    images: int = 0

    @property
    def text(self) -> str:
        return "\n".join(box.text for box in self.boxes)


@dataclass
class ExtractedDocument:
    kind: Literal["pdf", "docx"]
    text: str
    page_count: int | None = None
    truncated: bool = False
    pages: list[PageLayout] = field(default_factory=list)
    images: int = 0
    tables: int = 0
    columns: int = 1
    header_footer_text: str = ""
    textbox_text: str = ""


def _count_images(item: LTContainer) -> int:
    count = 0
    for child in item:
        if isinstance(child, LTImage):
            count += 1
        elif isinstance(child, LTFigure):
            count += _count_images(child) or 1
    return count


def extract_pdf(content: bytes) -> ExtractedDocument:
    """pdfminer default layout order, the same reading MarkItDown and simple ATSs use."""
    page_count = len(list(PDFPage.get_pages(io.BytesIO(content))))
    pages: list[PageLayout] = []
    for page in extract_pages(
        io.BytesIO(content), laparams=LAParams(), maxpages=MAX_PARSE_CHECK_PAGES
    ):
        boxes = [
            TextBox(item.x0, item.y0, item.x1, item.y1, item.get_text().strip())
            for item in page
            if isinstance(item, LTTextContainer) and item.get_text().strip()
        ]
        pages.append(PageLayout(page.width, page.height, boxes, _count_images(page)))
    text = "\n\n".join(page.text for page in pages)
    return ExtractedDocument(
        kind="pdf",
        text=text,
        page_count=page_count,
        truncated=page_count > MAX_PARSE_CHECK_PAGES,
        pages=pages,
        images=sum(page.images for page in pages),
    )


def _xml_text(element: Any) -> str:
    return "".join(t.text or "" for t in element.xpath(".//w:t")).strip()


def extract_docx(content: bytes) -> ExtractedDocument:
    """Body paragraphs and tables in document order; headers, footers and text boxes kept apart."""
    document = Document(io.BytesIO(content))
    body = document.element.body
    lines: list[str] = []
    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            runs = child.xpath(".//w:t[not(ancestor::w:txbxContent)]")
            lines.append("".join(t.text or "" for t in runs))
        elif tag == "tbl":
            for row in child.xpath("./w:tr"):
                cells = [_xml_text(cell) for cell in row.xpath("./w:tc")]
                lines.append(" | ".join(c for c in cells if c))
    header_footer: list[str] = []
    columns = 1
    for section in document.sections:
        for part in (section.header, section.footer):
            if not part.is_linked_to_previous:
                header_footer.extend(p.text for p in part.paragraphs if p.text.strip())
        for num in section._sectPr.xpath("./w:cols/@w:num"):
            columns = max(columns, int(num))
    textboxes = [_xml_text(box) for box in body.xpath(".//w:txbxContent")]
    images = len(body.xpath(".//w:drawing")) + len(body.xpath(".//w:pict"))
    return ExtractedDocument(
        kind="docx",
        text="\n".join(line for line in lines if line.strip()),
        images=images,
        tables=len(document.tables),
        columns=columns,
        header_footer_text="\n".join(header_footer),
        textbox_text="\n".join(t for t in textboxes if t),
    )


def _extract_sync(content: bytes, filename: str) -> ExtractedDocument:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise DocumentValidationError("Parse check supports PDF and DOCX files.")
    path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            path = Path(tmp.name)
            tmp.write(content)
        if suffix == ".pdf":
            _validate_pdf_container(path)
            result = extract_pdf(content)
        else:
            _validate_docx_container(path)
            result = extract_docx(content)
    finally:
        if path is not None:
            path.unlink(missing_ok=True)
    _validate_extracted_text(result.text)
    return result


async def extract_document(content: bytes, filename: str) -> ExtractedDocument:
    return await run_bounded_document_job(_extract_sync, content, filename)
