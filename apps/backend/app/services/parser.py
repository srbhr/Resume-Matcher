"""Document parsing service using markitdown and LLM."""

import array
import asyncio
import io
import logging
import re
import tempfile
import zipfile
import zlib
from pathlib import Path
from typing import Any, BinaryIO, Sequence

import anyio
from markitdown import MarkItDown
from pdfminer.ascii85 import ascii85decode, asciihexdecode
from pdfminer.ccitt import CCITTFaxDecoder
from pdfminer.lzw import LZWDecoder
from pdfminer.pdfdocument import PDFDocument
from pdfminer.pdfdevice import PDFDevice
from pdfminer.pdfinterp import PDFPageInterpreter, PDFResourceManager
from pdfminer.pdfpage import PDFPage
from pdfminer.pdfparser import PDFParser
from pdfminer.pdftypes import (
    LITERALS_ASCII85_DECODE,
    LITERALS_ASCIIHEX_DECODE,
    LITERALS_CCITTFAX_DECODE,
    LITERALS_DCT_DECODE,
    LITERALS_FLATE_DECODE,
    LITERALS_JBIG2_DECODE,
    LITERALS_JPX_DECODE,
    LITERALS_LZW_DECODE,
    LITERALS_RUNLENGTH_DECODE,
    LITERAL_CRYPT,
    PDFStream,
    apply_png_predictor,
    apply_tiff_predictor,
    int_value,
)
from pdfminer.psparser import PSKeyword, literal_name

from app.llm import complete_json, get_llm_config, get_model_name, get_safe_max_tokens
from app.prompts import PARSE_RESUME_PROMPT
from app.prompts.templates import RESUME_SCHEMA_EXAMPLE
from app.schemas import ResumeData

logger = logging.getLogger(__name__)

DOCUMENT_IO_CHUNK_SIZE = 64 * 1024
MAX_DOCX_MEMBERS = 1_024
MAX_UNPACKED_DOCUMENT_BYTES = 16 * 1024 * 1024
MAX_EXTRACTED_TEXT_BYTES = 2 * 1024 * 1024
# Decoder row buffers can allocate from dimensions before consuming input.
MAX_PDF_SCANLINE_COLUMNS = 32_768
MAX_PDF_SCANLINE_BYTES = 256 * 1024
DOCUMENT_CONVERSION_WORKERS = 2
DOCUMENT_CONVERSION_TIMEOUT_SECONDS = 120.0
_DOCUMENT_BACKGROUND_WORKERS: set[asyncio.Task[str]] = set()
_DOCUMENT_CONVERSION_LIMITER = anyio.CapacityLimiter(DOCUMENT_CONVERSION_WORKERS)


class DocumentValidationError(ValueError):
    """Raised when uploaded bytes are not a structurally valid document."""


class DocumentResourceLimitError(ValueError):
    """Raised when a valid document exceeds a bounded processing budget."""


_COMPOUND_FILE_SIGNATURE = bytes.fromhex("D0CF11E0A1B11AE1")


class _PDFDecodeBudget:
    """Track decoded PDF stream bytes across one parser instance."""

    def __init__(self) -> None:
        self.decoded_bytes = 0

    @property
    def remaining(self) -> int:
        """Return the bytes available to the next decoded stream."""
        return MAX_UNPACKED_DOCUMENT_BYTES - self.decoded_bytes

    def consume(self, size: int) -> None:
        """Charge one decoded stream to the document-wide limit."""
        if size > self.remaining:
            raise DocumentResourceLimitError(
                "Document expanded content exceeds the 16MB limit."
            )
        self.decoded_bytes += size


def _append_pdf_output(output: bytearray, chunk: bytes, limit: int) -> None:
    """Append decoded stream bytes without crossing the remaining budget."""
    if len(chunk) > limit - len(output):
        raise DocumentResourceLimitError(
            "Document expanded content exceeds the 16MB limit."
        )
    output.extend(chunk)


def _decode_flate_bounded(data: bytes, limit: int) -> bytes:
    """Incrementally inflate a stream while enforcing its remaining budget."""
    decoder = zlib.decompressobj()
    output = bytearray()
    for offset in range(0, len(data), DOCUMENT_IO_CHUNK_SIZE):
        pending = data[offset : offset + DOCUMENT_IO_CHUNK_SIZE]
        while pending:
            max_output = min(DOCUMENT_IO_CHUNK_SIZE, limit - len(output) + 1)
            chunk = decoder.decompress(pending, max_output)
            _append_pdf_output(output, chunk, limit)
            pending = decoder.unconsumed_tail
    _append_pdf_output(output, decoder.flush(limit - len(output) + 1), limit)
    if not decoder.eof:
        raise ValueError("Truncated FlateDecode stream")
    return bytes(output)


def _decode_lzw_bounded(data: bytes, limit: int) -> bytes:
    """Decode an LZW stream one emitted code at a time under a byte limit."""
    output = bytearray()
    for chunk in LZWDecoder(io.BytesIO(data)).run():
        _append_pdf_output(output, chunk, limit)
    return bytes(output)


def _decode_run_length_bounded(data: bytes, limit: int) -> bytes:
    """Decode Adobe run-length data without first materializing all output."""
    output = bytearray()
    offset = 0
    while offset < len(data):
        length = data[offset]
        offset += 1
        if length == 128:
            break
        if length < 128:
            end = offset + length + 1
            if end > len(data):
                raise ValueError("Truncated run-length literal")
            _append_pdf_output(output, data[offset:end], limit)
            offset = end
            continue
        if offset >= len(data):
            raise ValueError("Truncated run-length repeat")
        _append_pdf_output(output, bytes([data[offset]]) * (257 - length), limit)
        offset += 1
    return bytes(output)


class _BoundedCCITTFaxDecoder(CCITTFaxDecoder):
    """Collect CCITT rows only while they fit the current stream budget."""

    def __init__(
        self,
        width: int,
        *,
        bytealign: bool,
        reversed_bits: bool,
        limit: int,
    ) -> None:
        super().__init__(width, bytealign=bytealign, reversed=reversed_bits)
        self._chunks: list[bytes] = []
        self._decoded_size = 0
        self._limit = limit

    def output_line(self, y: int, bits: Sequence[int]) -> None:
        """Encode one decoded bitmap row after reserving its output bytes."""
        row_size = (len(bits) + 7) // 8
        if row_size > self._limit - self._decoded_size:
            raise DocumentResourceLimitError(
                "Document expanded content exceeds the 16MB limit."
            )
        row = array.array("B", [0] * row_size)
        source_bits = [1 - bit for bit in bits] if self.reversed else bits
        masks = (128, 64, 32, 16, 8, 4, 2, 1)
        for index, bit in enumerate(source_bits):
            if bit:
                row[index // 8] += masks[index % 8]
        encoded = row.tobytes()
        self._chunks.append(encoded)
        self._decoded_size += len(encoded)

    def close(self) -> bytes:
        """Join already bounded rows into the decoded stream."""
        return b"".join(self._chunks)


def _decode_ccitt_bounded(data: bytes, params: dict[str, Any], limit: int) -> bytes:
    """Decode the CCITT variant supported by pdfminer with bounded output."""
    if params.get("K") != -1:
        raise ValueError("Unsupported CCITT encoding")
    width = int_value(params.get("Columns"))
    if width <= 0:
        raise ValueError("CCITT stream has no positive column count")
    if width > MAX_PDF_SCANLINE_COLUMNS or (width + 7) // 8 > limit:
        raise DocumentResourceLimitError(
            "Document expanded content exceeds the 16MB limit."
        )
    decoder = _BoundedCCITTFaxDecoder(
        width,
        bytealign=bool(params.get("EncodedByteAlign")),
        reversed_bits=bool(params.get("BlackIs1")),
        limit=limit,
    )
    decoder.feedbytes(data)
    return decoder.close()


def _apply_pdf_predictor(data: bytes, params: dict[str, Any]) -> bytes:
    """Apply the same predictor transformations as pdfminer."""
    predictor = int_value(params.get("Predictor", 1))
    if predictor == 1:
        return data
    colors = int_value(params.get("Colors", 1))
    columns = int_value(params.get("Columns", 1))
    bits_per_component = int_value(params.get("BitsPerComponent", 8))
    if colors <= 0 or columns <= 0 or bits_per_component <= 0:
        raise ValueError("PDF predictor dimensions must be positive")
    row_bytes = (colors * columns * bits_per_component + 7) // 8
    if columns > MAX_PDF_SCANLINE_COLUMNS or row_bytes > MAX_PDF_SCANLINE_BYTES:
        raise DocumentResourceLimitError(
            "Document decoder row dimensions exceed the processing limit."
        )
    if predictor == 2:
        return apply_tiff_predictor(colors, columns, bits_per_component, data)
    if predictor >= 10:
        return apply_png_predictor(predictor, colors, columns, bits_per_component, data)
    raise ValueError("Unsupported PDF predictor")


def _decode_pdf_stream(
    data: bytes,
    filters: list[tuple[Any, Any]],
    limit: int,
) -> bytes:
    """Decode every PDF filter while bounding each expansion stage."""
    for filter_name, raw_params in filters:
        params = raw_params if isinstance(raw_params, dict) else {}
        if filter_name in LITERALS_FLATE_DECODE:
            data = _decode_flate_bounded(data, limit)
        elif filter_name in LITERALS_LZW_DECODE:
            data = _decode_lzw_bounded(data, limit)
        elif filter_name in LITERALS_ASCII85_DECODE:
            data = ascii85decode(data)
        elif filter_name in LITERALS_ASCIIHEX_DECODE:
            data = asciihexdecode(data)
        elif filter_name in LITERALS_RUNLENGTH_DECODE:
            data = _decode_run_length_bounded(data, limit)
        elif filter_name in LITERALS_CCITTFAX_DECODE:
            data = _decode_ccitt_bounded(data, params, limit)
        elif (
            filter_name in LITERALS_DCT_DECODE
            or filter_name in LITERALS_JBIG2_DECODE
            or filter_name in LITERALS_JPX_DECODE
        ):
            # pdfminer passes already compressed image formats through unchanged.
            pass
        elif filter_name == LITERAL_CRYPT:
            raise ValueError("Encrypted PDF streams are not supported")
        else:
            raise ValueError("Unsupported PDF stream filter")

        if len(data) > limit:
            raise DocumentResourceLimitError(
                "Document expanded content exceeds the 16MB limit."
            )
        if params and "Predictor" in params:
            data = _apply_pdf_predictor(data, params)
            if len(data) > limit:
                raise DocumentResourceLimitError(
                    "Document expanded content exceeds the 16MB limit."
                )
    return data


class _BoundedPDFStream(PDFStream):
    """PDF stream whose decoder charges a request-local shared budget."""

    def __init__(self, stream: PDFStream, budget: _PDFDecodeBudget) -> None:
        super().__init__(stream.attrs, stream.rawdata, stream.decipher)
        self._budget = budget

    def decode(self) -> None:
        """Decode this stream with bounded filter implementations."""
        if self.rawdata is None:
            raise ValueError("PDF stream has no raw data")
        data = self.rawdata
        if self.decipher:
            if self.objid is None or self.genno is None:
                raise ValueError("Encrypted PDF stream is missing an object ID")
            data = self.decipher(self.objid, self.genno, data, self.attrs)
        decoded = _decode_pdf_stream(data, self.get_filters(), self._budget.remaining)
        self._budget.consume(len(decoded))
        self.data = decoded
        self.rawdata = None


class _BoundedPDFParser(PDFParser):
    """Install bounded streams locally without patching pdfminer globals."""

    def __init__(self, stream: BinaryIO, budget: _PDFDecodeBudget) -> None:
        super().__init__(stream)
        self._budget = budget

    def do_keyword(self, pos: int, token: PSKeyword) -> None:
        """Replace each newly parsed stream with its bounded counterpart."""
        super().do_keyword(pos, token)
        if token is self.KEYWORD_STREAM:
            stream_pos, parsed = self.curstack[-1]
            if isinstance(parsed, PDFStream):
                self.curstack[-1] = (
                    stream_pos,
                    _BoundedPDFStream(parsed, self._budget),
                )


def _validate_pdf_container(path: Path) -> None:
    """Require a readable PDF whose decoded streams fit a shared budget."""
    try:
        with path.open("rb") as stream:
            budget = _PDFDecodeBudget()
            document = PDFDocument(_BoundedPDFParser(stream, budget))
            manager = PDFResourceManager(caching=False)
            interpreter = PDFPageInterpreter(manager, PDFDevice(manager))
            has_pages = False
            for page in PDFPage.create_pages(document):
                has_pages = True
                # Follow the real text consumer's references under the same
                # bounded stream decoder. A forged /Image label on a content
                # or font stream cannot bypass preflight expansion limits.
                interpreter.process_page(page)
            if not has_pages:
                raise ValueError("PDF has no pages")
            seen: set[int] = set()
            for xref in document.xrefs:
                for object_id in xref.get_objids():
                    if object_id in seen:
                        continue
                    seen.add(object_id)
                    value = document.getobj(object_id)
                    if isinstance(value, PDFStream):
                        # Text extraction never decodes image XObjects. Their
                        # optional codecs must not reject otherwise readable text.
                        if literal_name(value.attrs.get("Subtype")) != "Image":
                            value.get_data()
    except DocumentResourceLimitError:
        raise
    except Exception as exc:
        raise DocumentValidationError(
            "The uploaded file is not a valid PDF, DOC, or DOCX document."
        ) from exc


def _validate_docx_container(path: Path) -> None:
    """Require a bounded, readable Office Open XML word-processing package."""
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            if len(members) > MAX_DOCX_MEMBERS:
                raise DocumentResourceLimitError(
                    f"Document archive contains more than {MAX_DOCX_MEMBERS} entries."
                )

            names = {member.filename for member in members}
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise DocumentValidationError(
                    "The uploaded file is not a valid PDF, DOC, or DOCX document."
                )

            declared_size = 0
            for member in members:
                if member.flag_bits & 0x1:
                    raise DocumentValidationError(
                        "Encrypted PDF, DOC, or DOCX files are not supported."
                    )
                declared_size += member.file_size
                if declared_size > MAX_UNPACKED_DOCUMENT_BYTES:
                    raise DocumentResourceLimitError(
                        "Document expanded content exceeds the 16MB limit."
                    )

            streamed_size = 0
            for member in members:
                if member.is_dir():
                    continue
                with archive.open(member) as source:
                    while chunk := source.read(DOCUMENT_IO_CHUNK_SIZE):
                        streamed_size += len(chunk)
                        if streamed_size > MAX_UNPACKED_DOCUMENT_BYTES:
                            raise DocumentResourceLimitError(
                                "Document expanded content exceeds the 16MB limit."
                            )
    except DocumentResourceLimitError:
        raise
    except DocumentValidationError:
        raise
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as exc:
        raise DocumentValidationError(
            "The uploaded file is not a valid PDF, DOC, or DOCX document."
        ) from exc


def _validate_doc_container(path: Path) -> None:
    """Validate the fixed compound-file header used by legacy Word documents."""
    try:
        with path.open("rb") as stream:
            header = stream.read(512)
    except OSError as exc:
        raise DocumentValidationError(
            "The uploaded file is not a valid PDF, DOC, or DOCX document."
        ) from exc

    sector_shift = int.from_bytes(header[30:32], "little") if len(header) >= 32 else -1
    mini_sector_shift = (
        int.from_bytes(header[32:34], "little") if len(header) >= 34 else -1
    )
    if (
        len(header) != 512
        or header[:8] != _COMPOUND_FILE_SIGNATURE
        or header[28:30] != b"\xfe\xff"
        or sector_shift not in (9, 12)
        or mini_sector_shift != 6
        or header[34:40] != b"\x00" * 6
    ):
        raise DocumentValidationError(
            "The uploaded file is not a valid PDF, DOC, or DOCX document."
        )

    major_version = int.from_bytes(header[26:28], "little")
    file_size = path.stat().st_size
    sector_size = 1 << sector_shift
    sector_count = file_size // sector_size - 1
    fat_sector_count = int.from_bytes(header[44:48], "little")
    first_directory_sector = int.from_bytes(header[48:52], "little")
    difat_entries = [
        int.from_bytes(header[offset : offset + 4], "little")
        for offset in range(76, 512, 4)
    ]
    inline_fat_sectors = [entry for entry in difat_entries if entry < 0xFFFFFFFA]
    if (
        major_version not in (3, 4)
        or (major_version == 3 and sector_shift != 9)
        or (major_version == 4 and sector_shift != 12)
        or file_size < sector_size * 3
        or file_size % sector_size != 0
        or fat_sector_count < 1
        or fat_sector_count > sector_count
        or first_directory_sector >= sector_count
        or len(inline_fat_sectors) < min(fat_sector_count, len(difat_entries))
        or any(entry >= sector_count for entry in inline_fat_sectors)
    ):
        raise DocumentValidationError(
            "The uploaded file is not a valid PDF, DOC, or DOCX document."
        )


def _validate_extracted_text(text: str) -> None:
    """Bound prompt-bound UTF-8 text without allocating another full-size copy."""
    extracted_bytes = 0
    for offset in range(0, len(text), DOCUMENT_IO_CHUNK_SIZE):
        chunk = text[offset : offset + DOCUMENT_IO_CHUNK_SIZE]
        extracted_bytes += len(chunk.encode("utf-8"))
        if extracted_bytes > MAX_EXTRACTED_TEXT_BYTES:
            raise DocumentResourceLimitError(
                "Document extracted text exceeds the 2MB processing limit."
            )


# Matches date ranges like "Jan 2020 - Dec 2023", "May 2021 - Present",
# "January 2020 - Current", and single dates like "Jun 2023".
_MD_DATE_RE = re.compile(
    r"(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?"
    r"|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?"
    r"|Dec(?:ember)?)"
    r"\.?\s+\d{4})"
    r"(?:\s*[-–—]\s*"
    r"(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?"
    r"|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?"
    r"|Dec(?:ember)?)"
    r"\.?\s+\d{4}"
    r"|Present|Current|Now|Ongoing))?",
    re.IGNORECASE,
)
_MONTH_RE = re.compile(
    r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?"
    r"|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?"
    r"|Dec(?:ember)?)",
    re.IGNORECASE,
)


def _extract_markdown_dates(markdown: str) -> list[str]:
    """Extract all month-inclusive date ranges from markdown text."""
    return _MD_DATE_RE.findall(markdown)


def restore_dates_from_markdown(
    parsed_data: dict[str, Any],
    markdown: str,
) -> dict[str, Any]:
    """Patch year-only dates in parsed data with month-inclusive dates from markdown.

    The LLM sometimes drops months during parsing (e.g. "Jun 2020 - Aug 2021"
    becomes "2020 - 2021"). This function extracts all month-inclusive dates
    from the raw markdown and replaces year-only entries where a match exists.
    """

    def date_key(value: str) -> str:
        years = re.findall(r"\d{4}", value)
        if not years:
            return ""
        suffix = (
            "current"
            if re.search(r"\b(?:present|current|now|ongoing)\b", value, re.IGNORECASE)
            else ""
        )
        if not suffix and len(years) == 2 and years[0] == years[1]:
            years = years[:1]
        return " - ".join([*years, suffix] if suffix else years)

    occurrences: list[tuple[str, str, str, int]] = []
    lines = markdown.splitlines()
    for line_index, line in enumerate(lines):
        line_context = " ".join(line.casefold().split())
        for match in _MD_DATE_RE.finditer(line):
            full_date = re.sub(r"\s*[-–—]\s*", " - ", match.group(0).strip())
            key = date_key(full_date)
            if key:
                occurrences.append((key, full_date, line_context, line_index))
    if not occurrences:
        return parsed_data

    used: set[int] = set()
    patched = 0
    entry_count = sum(
        sum(isinstance(entry, dict) for entry in parsed_data.get(section, []))
        for section in ("workExperience", "education", "personalProjects")
        if isinstance(parsed_data.get(section), list)
    )
    custom_data = parsed_data.get("customSections")
    if isinstance(custom_data, dict):
        entry_count += sum(
            len(section.get("items", []))
            for section in custom_data.values()
            if isinstance(section, dict)
            and section.get("sectionType") == "itemList"
            and isinstance(section.get("items"), list)
        )

    def restore_entry(entry: Any, identity_fields: tuple[str, ...]) -> None:
        nonlocal patched
        if not isinstance(entry, dict):
            return
        years = entry.get("years", "")
        if not isinstance(years, str) or not years or _MONTH_RE.search(years):
            return
        key = date_key(years)
        candidates = [
            index
            for index, occurrence in enumerate(occurrences)
            if occurrence[0] == key and index not in used
        ]
        if not candidates:
            return
        terms = [
            " ".join(str(entry.get(field, "")).split()).casefold()
            for field in identity_fields
            if str(entry.get(field, "")).strip()
        ]
        scored = []
        for index in candidates:
            line_context = occurrences[index][2]
            line_index = occurrences[index][3]
            matched_terms = 0
            score = 0
            for term in terms:
                term_score = 20 if term in line_context else 0
                for distance in range(1, 6):
                    previous = line_index - distance
                    if previous >= 0 and term in " ".join(
                        lines[previous].casefold().split()
                    ):
                        term_score = max(term_score, 10 - distance)
                for distance in range(1, 4):
                    following = line_index + distance
                    if following < len(lines) and term in " ".join(
                        lines[following].casefold().split()
                    ):
                        term_score = max(term_score, 4 - distance)
                if term_score:
                    matched_terms += 1
                    score += term_score
            scored.append(((matched_terms, score), index))
        best_score = max(score for score, _ in scored)
        best = [index for score, index in scored if score == best_score]
        selected: int | None = None
        if best_score[0] > 0 and len(best) == 1 and (
            entry_count == 1 or best_score[0] == len(terms)
        ):
            selected = best[0]
        elif len(candidates) == 1 and entry_count == 1:
            selected = candidates[0]
        if selected is None:
            logger.info("Date restoration left ambiguous value unchanged: %s", years)
            return
        entry["years"] = occurrences[selected][1]
        used.add(selected)
        patched += 1

    for section_key, identity_fields in (
        ("workExperience", ("company", "title")),
        ("education", ("institution", "degree")),
        ("personalProjects", ("name", "role")),
    ):
        for entry in parsed_data.get(section_key, []):
            restore_entry(entry, identity_fields)

    custom = parsed_data.get("customSections", {})
    if isinstance(custom, dict):
        for section in custom.values():
            if (
                not isinstance(section, dict)
                or section.get("sectionType") != "itemList"
            ):
                continue
            for item in section.get("items", []):
                restore_entry(item, ("title", "subtitle"))

    if patched:
        logger.info("Restored months in %d date fields from raw markdown", patched)

    return parsed_data


_NON_CONTENT_RESUME_KEYS = frozenset(
    {
        "id",
        "sectionType",
        "descriptionStyles",
        "isDefault",
        "isVisible",
        "order",
        "key",
        "displayName",
    }
)
# Depth guard against self-referential or pathological LLM output.  Recursion
# starts at depth 0 on a *top-level section value*, so the deepest user-visible
# value the real ``ResumeData`` schema can produce sits at depth 5:
#
#   customSections(0) -> CustomSection(1) -> items(2) -> CustomSectionItem(3)
#       -> description(4) -> bullet string(5)
#
# Every other content section is shallower: workExperience / personalProjects
# bottom out at depth 3 (list -> Experience -> description -> bullet),
# education and additional at depth 2, personalInfo at depth 1, summary at
# depth 0.  Values are still inspected at depth 9 (the cut-off is ``>= 10``),
# so the limit leaves four full levels of headroom over the schema maximum.
# Nothing that validates as ``ResumeData`` can be misjudged empty here;
# anything deeper is malformed LLM output rather than a resume.  Raise this
# only if the schema itself grows deeper -- see the boundary tests in
# tests/unit/test_parser.py::TestMeaningfulResumeContent.
_MAX_RESUME_CONTENT_RECURSION = 10


def _has_meaningful_resume_value(
    value: Any,
    *,
    depth: int = 0,
    filter_structural_keys: bool = True,
) -> bool:
    """Return whether a value contains non-structural, user-visible text.

    Custom-section identifiers are dictionary keys rather than schema fields,
    so their values are checked without filtering the identifier itself.  Once
    inside a section, normal structural-key filtering resumes.
    """
    if depth >= _MAX_RESUME_CONTENT_RECURSION:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(
            _has_meaningful_resume_value(item, depth=depth + 1) for item in value
        )
    if isinstance(value, dict):
        return any(
            (not filter_structural_keys or key not in _NON_CONTENT_RESUME_KEYS)
            and _has_meaningful_resume_value(item, depth=depth + 1)
            for key, item in value.items()
        )
    return False


def has_meaningful_resume_content(resume_data: Any) -> bool:
    """Return whether parsed resume data contains any user-facing content.

    ``ResumeData`` intentionally defaults most fields to empty strings/lists.
    That is useful for the builder, but it also means an LLM response such as
    ``{}`` validates successfully.  Treating that response as a parsed resume
    produces a blank PDF and makes every downstream tailoring request operate
    on empty data.
    """

    if not isinstance(resume_data, dict):
        return False

    content_sections = (
        "personalInfo",
        "summary",
        "workExperience",
        "education",
        "personalProjects",
        "additional",
        "customSections",
    )
    return any(
        _has_meaningful_resume_value(
            resume_data.get(section),
            filter_structural_keys=section != "customSections",
        )
        for section in content_sections
    )


def _parse_document_sync(content: bytes, filename: str) -> str:
    """Validate and convert a document inside a bounded worker thread."""
    suffix = Path(filename).suffix.lower()
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp_path = Path(tmp.name)
            tmp.write(content)
        if suffix == ".pdf":
            _validate_pdf_container(tmp_path)
        elif suffix == ".doc":
            _validate_doc_container(tmp_path)
        elif suffix == ".docx":
            _validate_docx_container(tmp_path)
        md = MarkItDown()
        result = md.convert(str(tmp_path))
        text = result.text_content
        if not isinstance(text, str):
            raise DocumentValidationError(
                "The uploaded file is not a valid PDF, DOC, or DOCX document."
            )
        _validate_extracted_text(text)
        return text
    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)


def _validate_parsed_resume(result: dict[str, Any]) -> dict[str, Any]:
    """Validate that parsed output is a schema-valid, non-empty resume."""
    parsed_data = ResumeData.model_validate(result).model_dump()
    if not has_meaningful_resume_content(parsed_data):
        raise ValueError("LLM returned an empty structured resume.")
    return parsed_data


async def parse_document(content: bytes, filename: str) -> str:
    """Convert a bounded PDF/DOC/DOCX without blocking the request event loop.

    Args:
        content: Raw file bytes
        filename: Original filename for extension detection

    Returns:
        Markdown text content
    """
    deadline = asyncio.get_running_loop().time() + DOCUMENT_CONVERSION_TIMEOUT_SECONDS
    borrower = object()
    # Queued requests still belong to their caller. Only an admitted conversion
    # can outlive cancellation; abandoned queues never retain file bytes or run.
    await asyncio.wait_for(
        _DOCUMENT_CONVERSION_LIMITER.acquire_on_behalf_of(borrower),
        timeout=DOCUMENT_CONVERSION_TIMEOUT_SECONDS,
    )

    async def run_admitted_worker() -> str:
        try:
            return await anyio.to_thread.run_sync(
                _parse_document_sync, content, filename, abandon_on_cancel=False
            )
        finally:
            _DOCUMENT_CONVERSION_LIMITER.release_on_behalf_of(borrower)

    worker = asyncio.create_task(run_admitted_worker())
    try:
        return await asyncio.wait_for(
            asyncio.shield(worker),
            timeout=max(0.0, deadline - asyncio.get_running_loop().time()),
        )
    except (asyncio.CancelledError, TimeoutError):
        # Threads cannot be killed safely. Return on the caller's deadline while
        # the worker retains its limiter slot and owns its tempfile until done.
        _DOCUMENT_BACKGROUND_WORKERS.add(worker)

        def consume_result(done: asyncio.Task[str]) -> None:
            _DOCUMENT_BACKGROUND_WORKERS.discard(done)
            if not done.cancelled():
                try:
                    done.result()
                except Exception:
                    logger.exception(
                        "Document conversion failed after request cancellation"
                    )

        worker.add_done_callback(consume_result)
        raise


async def parse_resume_to_json(markdown_text: str) -> dict[str, Any]:
    """Parse resume markdown to structured JSON using LLM.

    After LLM parsing, patches any year-only dates with month-inclusive
    dates extracted from the raw markdown. This ensures months are never
    lost regardless of LLM behavior.

    Args:
        markdown_text: Resume content in markdown format

    Returns:
        Structured resume data matching ResumeData schema
    """
    if not markdown_text or not markdown_text.strip():
        raise ValueError("Resume content is empty after text extraction.")

    prompt = PARSE_RESUME_PROMPT.format(
        schema=RESUME_SCHEMA_EXAMPLE,
        resume_text=markdown_text,
    )

    config = get_llm_config()
    model_name = get_model_name(config)
    result = await complete_json(
        prompt=prompt,
        system_prompt="You are a JSON extraction engine. Output only valid JSON, no explanations.",
        max_tokens=get_safe_max_tokens(model_name, config=config),
        retries=3,
        response_validator=_validate_parsed_resume,
    )

    # Patch dates: restore months the LLM may have dropped
    result = restore_dates_from_markdown(result, markdown_text)

    # Validate against schema
    return _validate_parsed_resume(result)
