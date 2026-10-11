"""Deterministic parseability checks. Each returns a Check, or None when not applicable."""

import re
from collections import Counter
from collections.abc import Callable

from app.services.ats_parse.extract import ExtractedDocument, PageLayout, TextBox
from app.services.ats_parse.headings import REQUIRED_SECTIONS, synonyms
from app.services.ats_parse.models import Check, Severity, Status
from app.services.ats_parse.normalize import normalize
from app.services.parser import _MD_DATE_RE

TWO_COLUMN_TEMPLATES = frozenset(
    {"swiss-two-column", "modern-two-column", "vivid", "deedy"}
)
MIN_TEXT_CHARACTERS = 50
SPARSE_PAGE_CHARACTERS = 200
COLUMN_MIN_COVERAGE = 0.05
COLUMN_MIN_BOXES = 3
# Dates and locations right-aligned beside entry titles: narrow boxes ending at one edge.
RIGHT_BAND_MAX_WIDTH = 0.3
RIGHT_BAND_EDGE_TOLERANCE = 2.0
RIGHT_BAND_MIN_FLUSH = 0.8
MAX_COMFORTABLE_PAGES = 2

# Bounded local part keeps search linear on long "a.a.a..." runs (see normalize._TOKEN).
EMAIL_RE = re.compile(r"[\w.+-]{1,64}@[\w-]+(?:\.[\w-]+)+")
# Seven characters at least, so local numbers like "555-1234" count; has_phone
# then needs seven digits that are not all date parts.
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{5,}\d)")
# Digit groups of a year range ("2019 - 2022") or numeric date ("03.2019").
_DATE_PART = re.compile(r"(?:19|20)\d{2}|0?[1-9]|1[0-2]")
YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
GARBLED_RE = re.compile(r"\(cid:\d+\)|�|[-]")

Context = dict[str, str | bool | None]
CheckFn = Callable[[ExtractedDocument, Context], Check | None]


def _check(
    check_id: str,
    category: str,
    severity: Severity,
    status: Status,
    **params: object,
) -> Check:
    return Check(
        id=check_id, category=category, severity=severity, status=status, params=params
    )


def _visible_chars(text: str) -> int:
    return sum(1 for ch in text if not ch.isspace())


def text_layer(doc: ExtractedDocument, ctx: Context) -> Check:
    chars = _visible_chars(doc.text)
    status: Status = "pass" if chars >= MIN_TEXT_CHARACTERS else "fail"
    return _check("text_layer", "extraction", "high", status, characters=chars)


def garbled_glyphs(doc: ExtractedDocument, ctx: Context) -> Check:
    count = len(GARBLED_RE.findall(doc.text))
    ratio = count / max(1, _visible_chars(doc.text))
    status: Status = "fail" if ratio > 0.05 else "warn" if ratio > 0.005 else "pass"
    return _check(
        "garbled_glyphs",
        "extraction",
        "high",
        status,
        count=count,
        ratio=round(ratio, 4),
    )


def text_coverage(doc: ExtractedDocument, ctx: Context) -> Check | None:
    if doc.kind != "pdf" or not doc.pages:
        return None
    sparse = [
        i + 1
        for i, page in enumerate(doc.pages)
        if page.images and _visible_chars(page.text) < SPARSE_PAGE_CHARACTERS
    ]
    status: Status = (
        "pass" if not sparse else "fail" if len(sparse) == len(doc.pages) else "warn"
    )
    return _check("text_coverage", "extraction", "medium", status, pages=sparse)


def _union_length(intervals: list[tuple[float, float]]) -> float:
    total, end = 0.0, float("-inf")
    for lo, hi in sorted(intervals):
        if hi > end:
            total += hi - max(lo, end)
            end = hi
    return total


def _free_bands(
    blocked: list[tuple[float, float]], height: float
) -> list[tuple[float, float]]:
    """Vertical bands not covered by any box that crosses the gutter."""
    bands: list[tuple[float, float]] = []
    cursor = 0.0
    for lo, hi in sorted(blocked):
        if lo > cursor:
            bands.append((cursor, lo))
        cursor = max(cursor, hi)
    if cursor < height:
        bands.append((cursor, height))
    return bands


def _is_right_aligned_band(boxes: list[TextBox], page_width: float) -> bool:
    """Narrow boxes that all end at one right edge, like dates beside entry titles.

    A sidebar is ragged on the right. Entries with no body text between them leave
    these bands clear of full-width lines, so they would otherwise read as a column.
    """
    edge = max(b.x1 for b in boxes)
    flush = sum(1 for b in boxes if edge - b.x1 <= RIGHT_BAND_EDGE_TOLERANCE)
    widest = max(b.x1 - b.x0 for b in boxes)
    return (
        flush >= RIGHT_BAND_MIN_FLUSH * len(boxes)
        and widest < RIGHT_BAND_MAX_WIDTH * page_width
    )


def has_columns(page: PageLayout) -> bool:
    """True when a vertical gutter separates two text columns over a large span.

    Full-width lines cross every gutter in single-column layouts, so right-aligned
    dates beside a title do not count as a second column. Neither does a run of
    entries without body text, where those dates line up in a band of their own.
    """
    if page.height <= 0 or len(page.boxes) < 4:
        return False
    for step in range(25, 76, 2):
        gutter = page.width * step / 100
        free = _free_bands(
            [(b.y0, b.y1) for b in page.boxes if b.x0 < gutter < b.x1], page.height
        )
        for lo, hi in free:
            if hi - lo <= 0:
                continue
            left = [
                (max(b.y0, lo), min(b.y1, hi))
                for b in page.boxes
                if b.x1 <= gutter and b.y1 > lo and b.y0 < hi
            ]
            right_boxes = [
                b for b in page.boxes if b.x0 >= gutter and b.y1 > lo and b.y0 < hi
            ]
            if min(len(left), len(right_boxes)) < COLUMN_MIN_BOXES:
                continue
            if _is_right_aligned_band(right_boxes, page.width):
                continue
            right = [(max(b.y0, lo), min(b.y1, hi)) for b in right_boxes]
            coverage = min(_union_length(left), _union_length(right)) / page.height
            if coverage >= COLUMN_MIN_COVERAGE:
                return True
    return False


def multi_column(doc: ExtractedDocument, ctx: Context) -> Check:
    if doc.kind == "docx":
        pages = [1] if doc.columns > 1 else []
    else:
        pages = [i + 1 for i, page in enumerate(doc.pages) if has_columns(page)]
    params: dict[str, object] = {"pages": pages}
    if ctx.get("template"):
        params["expected_by_template"] = ctx["template"] in TWO_COLUMN_TEMPLATES
    return _check(
        "multi_column", "layout", "medium", "fail" if pages else "pass", **params
    )


def tables(doc: ExtractedDocument, ctx: Context) -> Check | None:
    if doc.kind != "docx":
        return None
    status: Status = "warn" if doc.tables else "pass"
    return _check("tables", "layout", "medium", status, count=doc.tables)


def text_boxes(doc: ExtractedDocument, ctx: Context) -> Check | None:
    if doc.kind != "docx":
        return None
    chars = _visible_chars(doc.textbox_text)
    status: Status = (
        "fail" if chars >= MIN_TEXT_CHARACTERS else "warn" if chars else "pass"
    )
    return _check("text_boxes", "layout", "medium", status, characters=chars)


def _repeated_margin_lines(pages: list[PageLayout]) -> list[str]:
    band = Counter[str]()
    for page in pages:
        seen = {
            normalize(box.text)
            for box in page.boxes
            if box.y0 > page.height * 0.92 or box.y1 < page.height * 0.08
        }
        band.update(line for line in seen if line)
    return sorted(line for line, n in band.items() if n >= 2)


def header_footer_content(doc: ExtractedDocument, ctx: Context) -> Check | None:
    if doc.kind == "docx":
        margin_text = doc.header_footer_text
        contact_only_there = bool(
            EMAIL_RE.search(margin_text) and not EMAIL_RE.search(doc.text)
        )
        status: Status = (
            "fail" if contact_only_there else "warn" if margin_text else "pass"
        )
        return _check(
            "header_footer_content",
            "layout",
            "medium",
            status,
            contact_only_in_margin=contact_only_there,
        )
    if len(doc.pages) < 2:
        return None
    repeated = _repeated_margin_lines(doc.pages)
    return _check(
        "header_footer_content",
        "layout",
        "medium",
        "warn" if repeated else "pass",
        repeated_lines=len(repeated),
    )


def images(doc: ExtractedDocument, ctx: Context) -> Check:
    status: Status = "warn" if doc.images else "pass"
    return _check("images", "layout", "low", status, count=doc.images)


def page_count(doc: ExtractedDocument, ctx: Context) -> Check | None:
    if doc.page_count is None:
        return None
    # An academic CV has no comfortable length, so only truncation warns.
    too_long = not ctx.get("cv_mode") and doc.page_count > MAX_COMFORTABLE_PAGES
    status: Status = "warn" if doc.truncated or too_long else "pass"
    return _check(
        "page_count",
        "layout",
        "low",
        status,
        pages=doc.page_count,
        truncated=doc.truncated,
    )


def has_phone(text: str) -> bool:
    """A phone-shaped digit run: at least 7 digits that are not all date parts."""
    for match in PHONE_RE.finditer(text):
        groups = re.findall(r"\d+", match.group())
        if sum(len(g) for g in groups) >= 7 and not all(
            _DATE_PART.fullmatch(g) for g in groups
        ):
            return True
    return False


def contact_info(doc: ExtractedDocument, ctx: Context) -> Check:
    email = EMAIL_RE.search(doc.text)
    phone = has_phone(doc.text)
    position = round(email.start() / max(1, len(doc.text)), 2) if email else None
    if not email:
        status: Status = "fail"
    elif not phone or (position is not None and position > 0.25):
        status = "warn"
    else:
        status = "pass"
    return _check(
        "contact_info",
        "content",
        "high",
        status,
        email=bool(email),
        phone=phone,
        email_position=position,
    )


# What may follow a heading synonym: punctuation ("&", "・", ":") or a joining word
# from a supported locale ("Habilidades y Premios", "기술 및 수상 내역", "技能与荣誉").
_HEADING_JOINER = re.compile(r"[^\w\s]|(?:and|y|e|et|및)\s|[与和及]")


def _heading_lines(text: str) -> list[str]:
    return [
        line.strip(" :•|")
        for line in normalize(text).splitlines()
        if 0 < len(line.split()) <= 6 and len(line) <= 60
    ]


def is_heading(line: str, names: list[str]) -> bool:
    """A synonym alone, or joined to more heading text ("skills & awards", "技能与荣誉").

    Prose that merely starts with a synonym ("experience in product engineering",
    "技術を活用した開発") is not a heading.
    """
    for name in names:
        if line.startswith(name):
            rest = line[len(name) :].lstrip()
            if not rest or rest in names or _HEADING_JOINER.match(rest):
                return True
    return False


def find_sections(
    text: str, locale: str | None, kinds: tuple[str, ...] = REQUIRED_SECTIONS
) -> list[str]:
    lines = _heading_lines(text)
    found = []
    for kind in kinds:
        names = [normalize(name) for name in synonyms(kind, locale)]
        if any(is_heading(line, names) for line in lines):
            found.append(kind)
    return found


def section_headings(doc: ExtractedDocument, ctx: Context) -> Check:
    found = find_sections(doc.text, ctx.get("locale"))
    missing = [kind for kind in REQUIRED_SECTIONS if kind not in found]
    if not missing:
        status: Status = "pass"
    elif "experience" in missing or len(missing) > 1:
        status = "fail"
    else:
        status = "warn"
    return _check(
        "section_headings",
        "content",
        "medium",
        status,
        found=found,
        missing=missing,
        render_locale=ctx.get("locale") or "any",
    )


def dates(doc: ExtractedDocument, ctx: Context) -> Check:
    month_dates = len(_MD_DATE_RE.findall(doc.text))
    years = len(YEAR_RE.findall(doc.text))
    status: Status = "pass" if years else "warn"
    return _check(
        "dates", "content", "low", status, month_dates=month_dates, years=years
    )


CHECKS: tuple[CheckFn, ...] = (
    text_layer,
    garbled_glyphs,
    text_coverage,
    multi_column,
    tables,
    text_boxes,
    header_footer_content,
    images,
    page_count,
    contact_info,
    section_headings,
    dates,
)

PENALTY: dict[Severity, int] = {"high": 30, "medium": 12, "low": 4}


def run_checks(doc: ExtractedDocument, ctx: Context) -> list[Check]:
    return [check for fn in CHECKS if (check := fn(doc, ctx)) is not None]


def score(checks: list[Check], categories: set[str]) -> int:
    """100 minus severity penalties; a warning costs half a failure."""
    total = 100.0
    for check in checks:
        if check.category not in categories or check.status == "pass":
            continue
        penalty = PENALTY[check.severity]
        total -= penalty if check.status == "fail" else penalty / 2
    return max(0, min(100, round(total)))
