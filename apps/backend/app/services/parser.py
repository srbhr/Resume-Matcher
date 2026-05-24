"""Document parsing service using markitdown and LLM."""

import logging
import re
import tempfile
from pathlib import Path
from typing import Any

from markitdown import MarkItDown
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar
from pypdf import PdfReader

from app.llm import complete_json, get_llm_config, get_model_name, get_safe_max_tokens
from app.prompts import PARSE_RESUME_PROMPT
from app.prompts.templates import RESUME_SCHEMA_EXAMPLE
from app.schemas import ResumeData

logger = logging.getLogger(__name__)

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
    md_dates = _extract_markdown_dates(markdown)
    if not md_dates:
        return parsed_data

    # Build a lookup: "2020 - 2021" → "Jun 2020 - Aug 2021"
    year_to_full: dict[str, str] = {}
    year_only_re = re.compile(r"\d{4}")
    for md_date in md_dates:
        years_in_date = year_only_re.findall(md_date)
        if years_in_date:
            # Create year-only key like "2020 - 2021" or "2023"
            year_key = " - ".join(years_in_date)
            # Keep the first (most specific) match
            if year_key not in year_to_full:
                # Normalize separators
                normalized = re.sub(r"\s*[-–—]\s*", " - ", md_date.strip())
                year_to_full[year_key] = normalized

    if not year_to_full:
        return parsed_data

    patched = 0
    for section_key in ("workExperience", "education", "personalProjects"):
        for entry in parsed_data.get(section_key, []):
            if not isinstance(entry, dict):
                continue
            years = entry.get("years", "")
            if not isinstance(years, str) or not years:
                continue
            # Skip if already has months
            if re.search(
                r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)",
                years,
                re.IGNORECASE,
            ):
                continue
            # Try to find a matching month-inclusive date
            if years in year_to_full:
                entry["years"] = year_to_full[years]
                patched += 1

    # Custom sections
    custom = parsed_data.get("customSections", {})
    if isinstance(custom, dict):
        for section in custom.values():
            if not isinstance(section, dict) or section.get("sectionType") != "itemList":
                continue
            for item in section.get("items", []):
                if not isinstance(item, dict):
                    continue
                years = item.get("years", "")
                if not isinstance(years, str) or not years:
                    continue
                if re.search(
                    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)",
                    years,
                    re.IGNORECASE,
                ):
                    continue
                if years in year_to_full:
                    item["years"] = year_to_full[years]
                    patched += 1

    if patched:
        logger.info("Restored months in %d date fields from raw markdown", patched)

    return parsed_data


def _extract_pdf_links(pdf_path: Path) -> list[tuple[str, str]]:
    """Extract hyperlinks from a PDF as (visible_text, uri) pairs in reading order.

    Combines pypdf (for /Link annotations with URIs and rects) with pdfminer
    (for per-character positions) to map each link rect to its visible glyphs.
    Skips mailto:/tel: links since email and phone are captured into dedicated
    personalInfo fields as raw values. Multi-line links produce one pair per
    text line, in reading order; the caller is responsible for merging
    consecutive same-URI pairs into a single span across line breaks.

    Returns an empty list if the PDF has no link annotations or extraction
    fails for any reason — the caller falls back to plain markdown.
    """
    try:
        reader = PdfReader(str(pdf_path))
        links_per_page: list[list[dict[str, Any]]] = []
        for page in reader.pages:
            page_links: list[dict[str, Any]] = []
            annots = page.get("/Annots") or []
            for a in annots:
                obj = a.get_object()
                if obj.get("/Subtype") != "/Link":
                    continue
                action = obj.get("/A")
                if not action:
                    continue
                uri = action.get_object().get("/URI")
                rect = obj.get("/Rect")
                if not (uri and rect):
                    continue
                uri_str = str(uri)
                if uri_str.startswith(("mailto:", "tel:")):
                    continue
                page_links.append(
                    {
                        "uri": uri_str,
                        "rect": [float(x) for x in rect],
                        "chars": [],
                        "min_y": float("inf"),
                        "min_x": float("inf"),
                    }
                )
            links_per_page.append(page_links)

        if not any(links_per_page):
            return []

        for pi, layout in enumerate(extract_pages(str(pdf_path))):
            page_links = links_per_page[pi]
            if not page_links:
                continue
            stack: list[Any] = [layout]
            while stack:
                elem = stack.pop()
                if isinstance(elem, LTChar):
                    cx = (elem.x0 + elem.x1) / 2
                    cy = (elem.y0 + elem.y1) / 2
                    for link in page_links:
                        r = link["rect"]
                        if r[0] <= cx <= r[2] and r[1] <= cy <= r[3]:
                            link["chars"].append((elem.y0, elem.x0, elem.get_text()))
                            link["min_y"] = min(link["min_y"], elem.y0)
                            link["min_x"] = min(link["min_x"], elem.x0)
                            break
                elif hasattr(elem, "__iter__"):
                    stack.extend(elem)

        pairs: list[tuple[str, str]] = []
        for page_links in links_per_page:
            page_links.sort(key=lambda link: (-link["min_y"], link["min_x"]))
            for link in page_links:
                # Group chars by their text line (rounded y), then per line
                # sort left-to-right; lines top-to-bottom. Each line becomes
                # its own (visible_text, uri) pair so multi-line links wrap
                # each fragment independently.
                lines: dict[float, list[tuple[float, str]]] = {}
                for y0, x0, ch in link["chars"]:
                    key = round(y0, 1)
                    lines.setdefault(key, []).append((x0, ch))
                for key in sorted(lines.keys(), reverse=True):
                    line_chars = sorted(lines[key], key=lambda t: t[0])
                    visible = "".join(c[1] for c in line_chars).strip()
                    if visible:
                        pairs.append((visible, link["uri"]))
        return pairs
    except Exception as e:
        logger.warning("PDF link extraction failed: %s", e)
        return []


def _apply_links_to_markdown(
    markdown: str, links: list[tuple[str, str]]
) -> str:
    """Wrap visible-text occurrences with markdown link syntax.

    Processes links in PDF reading order; each replacement advances the
    search cursor so duplicate visible texts (e.g. "andrewscouten" used
    for both LinkedIn and GitHub) map to distinct occurrences in order.

    Consecutive same-URI entries are treated as one logical link split
    across PDF lines: if every fragment is found in order with only
    whitespace separating them in the markdown, the whole span is wrapped
    as a single markdown link with internal whitespace collapsed to single
    spaces (markdown link text doesn't render newlines well). If the
    multi-fragment chain can't be validated, falls back to wrapping each
    fragment independently.
    """
    if not links:
        return markdown

    # Group consecutive same-URI fragments
    groups: list[tuple[list[str], str]] = []
    for visible, uri in links:
        if groups and groups[-1][1] == uri:
            groups[-1][0].append(visible)
        else:
            groups.append(([visible], uri))

    out: list[str] = []
    pos = 0
    for fragments, uri in groups:
        # Try to span all fragments as one merged link
        spans: list[tuple[int, int]] | None = []
        search = pos
        for frag in fragments:
            if not frag:
                spans = None
                break
            idx = markdown.find(frag, search)
            if idx == -1:
                spans = None
                break
            if spans and markdown[spans[-1][1] : idx].strip():
                # Non-whitespace between fragments: not really one link
                spans = None
                break
            spans.append((idx, idx + len(frag)))
            search = idx + len(frag)

        if spans:
            start, end = spans[0][0], spans[-1][1]
            link_text = re.sub(r"\s+", " ", markdown[start:end]).strip()
            out.append(markdown[pos:start])
            out.append(f"[{link_text}]({uri})")
            pos = end
        else:
            # Fall back: wrap each fragment independently
            for frag in fragments:
                if not frag:
                    continue
                idx = markdown.find(frag, pos)
                if idx == -1:
                    continue
                out.append(markdown[pos:idx])
                out.append(f"[{frag}]({uri})")
                pos = idx + len(frag)
    out.append(markdown[pos:])
    return "".join(out)


_MD_LINK_RE = re.compile(r"\[([^\]\n]+)\]\(([^)\s]+)\)")


def _md_links_to_html(text: str) -> str:
    """Convert `[text](url)` markdown links to `<a>` HTML tags.

    The frontend's editor (Tiptap) and preview (`SafeHtml` → DOMPurify) both
    work in HTML; markdown link syntax renders as literal characters. We
    convert at the import boundary so stored data is consistent with both.

    Idempotent: the pattern doesn't match `<a>` tags, so re-running on
    already-converted text is a no-op.
    """
    if not text or "[" not in text:
        return text

    def _esc(s: str) -> str:
        return (
            s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    def _replace(m: re.Match[str]) -> str:
        link_text = _esc(m.group(1))
        url = _esc(m.group(2))
        return f'<a href="{url}" target="_blank" rel="noopener noreferrer">{link_text}</a>'

    return _MD_LINK_RE.sub(_replace, text)


def _convert_md_links_in_data(data: dict[str, Any]) -> dict[str, Any]:
    """Walk parsed resume JSON and convert markdown links in all text fields.

    Covers every place the LLM is told to emit markdown links: summary,
    workExperience / personalProjects bullet lists, education descriptions,
    and the text/items.description of custom sections. PersonalInfo fields
    are intentionally skipped — the prompt requires raw values there.
    """
    if isinstance(data.get("summary"), str):
        data["summary"] = _md_links_to_html(data["summary"])

    for exp in data.get("workExperience", []) or []:
        if isinstance(exp, dict) and isinstance(exp.get("description"), list):
            exp["description"] = [
                _md_links_to_html(d) if isinstance(d, str) else d
                for d in exp["description"]
            ]

    for edu in data.get("education", []) or []:
        if isinstance(edu, dict) and isinstance(edu.get("description"), str):
            edu["description"] = _md_links_to_html(edu["description"])

    for proj in data.get("personalProjects", []) or []:
        if isinstance(proj, dict) and isinstance(proj.get("description"), list):
            proj["description"] = [
                _md_links_to_html(d) if isinstance(d, str) else d
                for d in proj["description"]
            ]

    custom = data.get("customSections", {})
    if isinstance(custom, dict):
        for section in custom.values():
            if not isinstance(section, dict):
                continue
            if isinstance(section.get("text"), str):
                section["text"] = _md_links_to_html(section["text"])
            for item in section.get("items") or []:
                if isinstance(item, dict) and isinstance(item.get("description"), list):
                    item["description"] = [
                        _md_links_to_html(d) if isinstance(d, str) else d
                        for d in item["description"]
                    ]

    return data


async def parse_document(content: bytes, filename: str) -> str:
    """Convert PDF/DOCX to Markdown using markitdown.

    For PDFs, also extracts hyperlink annotations and wraps matching visible
    text in markdown link syntax so the LLM can preserve links in the
    parsed JSON. Non-PDF formats are returned as-is.

    Args:
        content: Raw file bytes
        filename: Original filename for extension detection

    Returns:
        Markdown text content (with inline hyperlinks for PDFs)
    """
    suffix = Path(filename).suffix.lower()

    # Write to temp file for markitdown
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        md = MarkItDown()
        result = md.convert(str(tmp_path))
        markdown_text = result.text_content

        if suffix == ".pdf":
            links = _extract_pdf_links(tmp_path)
            if links:
                markdown_text = _apply_links_to_markdown(markdown_text, links)
                logger.info(
                    "Applied %d PDF hyperlinks to markdown", len(links)
                )

        return markdown_text
    finally:
        tmp_path.unlink(missing_ok=True)


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
    prompt = PARSE_RESUME_PROMPT.format(
        schema=RESUME_SCHEMA_EXAMPLE,
        resume_text=markdown_text,
    )

    config = get_llm_config()
    model_name = get_model_name(config)
    result = await complete_json(
        prompt=prompt,
        system_prompt="You are a JSON extraction engine. Output only valid JSON, no explanations.",
        max_tokens=get_safe_max_tokens(model_name),
        retries=3,
    )

    # Patch dates: restore months the LLM may have dropped
    result = restore_dates_from_markdown(result, markdown_text)

    # Convert markdown link syntax to HTML so the frontend editor (Tiptap)
    # and preview (SafeHtml) render them as clickable links instead of
    # showing the literal `[text](url)` characters.
    result = _convert_md_links_in_data(result)

    # Validate against schema
    validated = ResumeData.model_validate(result)
    return validated.model_dump()
