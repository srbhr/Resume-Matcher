"""ATS parse-check engine: normalization, checks, scoring and round trip."""

import copy
import io
import json
import time
from pathlib import Path
from typing import Any

import pytest
from docx import Document
from docx.shared import Inches
from pydantic import ValidationError

from app.services.ats_parse import build_report, parse_check_bytes
from app.services.ats_parse.checks import find_sections, has_columns, run_checks, score
from app.services.ats_parse.extract import (
    MAX_COUNTED_PAGES,
    MAX_PARSE_CHECK_PAGES,
    ExtractedDocument,
    PageLayout,
    TextBox,
    extract_pdf,
)
from app.services.ats_parse.headings import HEADINGS
from app.services.ats_parse.models import Check
from app.services.ats_parse.normalize import normalize, rejoin_letter_spacing, tokens
from app.services.ats_parse.roundtrip import (
    compute_roundtrip,
    expected_fields,
    kendall_fidelity,
)
from tests.ats_fixtures import fixture, john_doe, render
from tests.unit.test_page_fit import _pdf

pytestmark = pytest.mark.unit

MESSAGES = Path(__file__).resolve().parents[3] / "frontend" / "messages"


def _status(checks: list[Check], check_id: str) -> str:
    return next(c.status for c in checks if c.id == check_id)


def _text_doc(text: str) -> ExtractedDocument:
    return ExtractedDocument(kind="pdf", text=text, page_count=1)


def _docx(build: Any) -> bytes:
    document = Document()
    build(document)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _form_xobject_pdf(text: str) -> bytes:
    """One page whose only text is drawn inside a form XObject (``/Fx Do``)."""
    form = f"BT /F1 12 Tf 72 700 Td ({text}) Tj ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Resources << /XObject << /Fx 5 0 R >> >> /Contents 4 0 R >>",
        "<< /Length 9 >> stream\n/Fx Do\n\nendstream",
        "<< /Type /XObject /Subtype /Form /BBox [0 0 612 792] "
        "/Resources << /Font << /F1 6 0 R >> >> "
        f"/Length {len(form)} >> stream\n{form}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(f"{n} 0 obj {body} endobj\n".encode())
    xref = out.tell()
    out.write(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(
        f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF".encode()
    )
    return out.getvalue()


# -- normalize -----------------------------------------------------------------


def test_letter_spaced_headings_are_rejoined() -> None:
    assert rejoin_letter_spacing("S U M M A R Y") == "SUMMARY"
    assert normalize("E X P E R I E N C E\nAcme") == "experience\nacme"
    assert rejoin_letter_spacing("I am a dev") == "I am a dev"


def test_email_matching_is_linear_on_dotted_runs() -> None:
    # Unbounded, both patterns backtracked from every position: about a minute.
    text = "a." * 100_000
    start = time.perf_counter()
    assert tokens(text) == ["a"] * 100_000
    assert _status(run_checks(_text_doc(text), {}), "contact_info") == "fail"
    assert time.perf_counter() - start < 2
    assert tokens("Mail john.doe+cv@mail.example.com") == [
        "mail",
        "john.doe+cv@mail.example.com",
    ]


def test_supplementary_han_is_split_per_character() -> None:
    assert tokens("\U0002000b\U00020089") == ["\U0002000b", "\U00020089"]


def test_cjk_split_keeps_latin_runs_whole() -> None:
    assert tokens("Java开发 Python3工程师") == [
        "java",
        "开",
        "发",
        "python3",
        "工",
        "程",
        "师",
    ]
    data = {
        "personalInfo": {"name": "Li Wei"},
        "additional": {"technicalSkills": ["Java"]},
    }
    by_field = {
        f.field: f.status for f in compute_roundtrip(data, "Li Wei\nJava开发").fields
    }
    assert by_field["additional.technicalSkills"] == "found"


def test_normalize_strips_inline_html_and_keeps_real_hyphens() -> None:
    assert (
        normalize("<strong>Led</strong> open-\nsource work") == "led open-source work"
    )


# -- layout ----------------------------------------------------------------------


def _page(*boxes: tuple[float, float, float, float]) -> PageLayout:
    return PageLayout(600, 800, [TextBox(*b, "x") for b in boxes])


def test_columns_need_a_gutter_over_a_large_span() -> None:
    two_columns = _page(
        (20, 660, 360, 760),
        (20, 540, 360, 640),
        (20, 420, 360, 520),
        (400, 700, 580, 760),
        (400, 600, 580, 680),
        (400, 500, 580, 580),
    )
    dates_beside_titles = _page(
        (20, 700, 150, 740),
        (480, 700, 580, 740),
        (20, 650, 580, 690),
        (20, 600, 580, 640),
    )
    assert has_columns(two_columns)
    assert not has_columns(dates_beside_titles)


@pytest.mark.parametrize(
    ("name", "status"),
    [
        ("single-column", "pass"),
        ("modern-single-column", "pass"),
        ("two-column", "fail"),
        ("modern-two-column", "fail"),
    ],
)
async def test_multi_column_on_real_renders(name: str, status: str) -> None:
    report = await parse_check_bytes(render(name), f"{name}.pdf")
    assert _status(report.checks, "multi_column") == status
    assert report.extractability == "full"


async def test_two_column_render_scrambles_reading_order() -> None:
    single = await parse_check_bytes(
        render("single-column"), "a.pdf", source="render", resume_data=john_doe()
    )
    double = await parse_check_bytes(
        render("two-column"), "b.pdf", source="render", resume_data=john_doe()
    )
    assert single.roundtrip.content_recall == 1.0
    assert single.roundtrip.order_fidelity == 1.0
    assert double.roundtrip.order_fidelity < 0.9
    assert double.overall_score < single.overall_score


async def test_sparse_sidebar_still_counts_as_two_columns() -> None:
    # A short skills sidebar covers little of the page but still interleaves.
    report = await parse_check_bytes(
        fixture("swiss-two-column-sparse"),
        "a.pdf",
        source="render",
        resume_data=john_doe(),
        template="swiss-two-column",
    )
    assert _status(report.checks, "multi_column") == "fail"
    assert report.roundtrip.order_fidelity < 0.9


async def test_small_caps_glyphs_are_flagged_and_not_matched_elsewhere() -> None:
    # The clean template's small-caps titles encode "e" as U+F765, so
    # "Senior Software Engineer" in the header must not stand in for the job title.
    report = await parse_check_bytes(
        fixture("clean-small-caps"), "c.pdf", source="render", resume_data=john_doe()
    )
    assert _status(report.checks, "garbled_glyphs") == "warn"
    fields = {f.field: f.status for f in report.roundtrip.fields}
    assert fields["personalInfo.title"] == "found"
    assert fields["workExperience[0].title"] == "missing"
    assert _status(report.checks, "section_headings") == "pass"


async def test_roundtrip_uses_the_template_contact_order() -> None:
    # The clean template renders location, phone, then email.
    report = await parse_check_bytes(
        fixture("clean-small-caps"),
        "c.pdf",
        source="render",
        resume_data=john_doe(),
        template="clean",
    )
    assert report.roundtrip.order_fidelity == 1.0
    names = [name for name, _ in expected_fields(john_doe(), "latex")[0]][:5]
    assert names[2:] == [
        "personalInfo.location",
        "personalInfo.phone",
        "personalInfo.email",
    ]


async def test_pdf_without_text_is_not_extractable() -> None:
    report = await parse_check_bytes(_pdf(1), "scan.pdf")
    assert report.extractability == "none"
    assert _status(report.checks, "text_layer") == "fail"


def test_pdf_page_count_stops_at_the_budget() -> None:
    doc = extract_pdf(_pdf(MAX_COUNTED_PAGES + 50))
    assert doc.page_count == MAX_COUNTED_PAGES
    assert doc.truncated
    assert len(doc.pages) == MAX_PARSE_CHECK_PAGES


async def test_pdf_text_inside_form_xobjects_is_extracted() -> None:
    line = "Jane Doe jane@example.com Senior Engineer at Acme since 2019"
    report = await parse_check_bytes(_form_xobject_pdf(line), "form.pdf")
    assert line in report.extracted_text_preview
    assert _status(report.checks, "text_layer") == "pass"


async def test_docx_tables_and_header_contact_are_flagged() -> None:
    def build(document: Any) -> None:
        document.sections[0].header.paragraphs[0].text = "jane@example.com 555-010-0100"
        document.add_paragraph("EXPERIENCE")
        table = document.add_table(rows=1, cols=2)
        table.cell(0, 0).text = "Acme Corp"
        table.cell(0, 1).text = "2020 - 2022"

    report = await parse_check_bytes(_docx(build), "resume.docx")
    assert _status(report.checks, "tables") == "warn"
    assert _status(report.checks, "header_footer_content") == "fail"
    assert _status(report.checks, "contact_info") == "fail"
    assert "Acme Corp | 2020 - 2022" in report.extracted_text_preview


async def test_docx_tabs_and_line_breaks_separate_words() -> None:
    def build(document: Any) -> None:
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.tab_stops.add_tab_stop(Inches(3))
        run = paragraph.add_run("Jane Doe")
        run.add_tab()
        run.add_text("Engineer")
        run.add_break()
        run.add_text("Acme")
        cell = document.add_table(rows=1, cols=1).cell(0, 0)
        cell.paragraphs[0].add_run("Go").add_tab()
        cell.paragraphs[0].add_run("Python")

    report = await parse_check_bytes(_docx(build), "resume.docx")
    lines = report.extracted_text_preview.split("\n")
    assert lines[:2] == ["Jane Doe\tEngineer", "Acme"]
    assert "Go\tPython" in lines


async def test_docx_contact_in_a_header_table_is_flagged() -> None:
    def build(document: Any) -> None:
        header = document.sections[0].header
        table = header.add_table(rows=1, cols=2, width=document.sections[0].page_width)
        table.cell(0, 0).text = "Jane Doe"
        table.cell(0, 1).text = "jane@example.com"
        document.add_paragraph("EXPERIENCE")

    report = await parse_check_bytes(_docx(build), "resume.docx")
    check = next(c for c in report.checks if c.id == "header_footer_content")
    assert check.status == "fail"
    assert check.params["contact_only_in_margin"] is True


# -- content ---------------------------------------------------------------------


def test_contact_info_found_late_is_a_warning() -> None:
    early = run_checks(
        _text_doc("Jane jane@x.com +1 415 555 0100\n" + "word " * 200), {}
    )
    late = run_checks(_text_doc("word " * 200 + "jane@x.com +1 415 555 0100"), {})
    assert _status(early, "contact_info") == "pass"
    assert _status(late, "contact_info") == "warn"


@pytest.mark.parametrize(
    ("text", "phone"),
    [
        ("Acme 2019 - 2022", False),
        ("Acme 03.2019 - 06.2022", False),
        ("2019 - 2022\n+44 20 7946 0958", True),
        ("(415) 555-0142", True),
    ],
)
def test_contact_info_needs_a_phone_shaped_number(text: str, phone: bool) -> None:
    checks = run_checks(_text_doc(f"Jane jane@x.com\n{text}\n" + "word " * 50), {})
    check = next(c for c in checks if c.id == "contact_info")
    assert check.params["phone"] is phone
    assert check.status == ("pass" if phone else "warn")


@pytest.mark.parametrize(
    ("text", "locale", "status"),
    [
        ("Experiencia\nEducación\nHabilidades", "es", "pass"),
        ("Experience\nEducation\nSkills", "ja", "pass"),
        ("Experience\nSkills", None, "warn"),
        ("Experience with Python and teams across many offices", None, "fail"),
        # Short prose that starts with a synonym is not a heading.
        ("Experience in product engineering\nEducation\nSkills", None, "fail"),
        ("職歴\n学歴\n技術を活用したシステム開発", "ja", "warn"),
        ("職歴\n学歴\n技術スキル", "ja", "pass"),
    ],
)
def test_section_headings(text: str, locale: str | None, status: str) -> None:
    assert (
        _status(run_checks(_text_doc(text), {"locale": locale}), "section_headings")
        == status
    )


def test_headings_cover_every_frontend_locale_label() -> None:
    kinds = {"summary": "summary", "experience": "experience", "education": "education"}
    kinds |= {"projects": "projects", "skills": "skills"}
    for path in MESSAGES.glob("*.json"):
        locale = path.stem.split("-")[0]
        labels = json.loads(path.read_text(encoding="utf-8"))["resume"]["sections"]
        for label_key, kind in kinds.items():
            label = normalize(labels[label_key])
            assert any(
                label.startswith(normalize(s)) for s in HEADINGS[locale][kind]
            ), f"{path.name}: {label!r} not in HEADINGS[{locale!r}][{kind!r}]"


@pytest.mark.parametrize("skills_key", ["skills", "skillsOnly"])
def test_frontend_section_labels_read_as_headings(skills_key: str) -> None:
    # "Skills & Awards", "Habilidades y Premios", "技能与荣誉" and the like.
    for path in MESSAGES.glob("*.json"):
        labels = json.loads(path.read_text(encoding="utf-8"))["resume"]["sections"]
        text = "\n".join(labels[k] for k in ("experience", "education", skills_key))
        found = find_sections(text, path.stem)
        assert found == ["experience", "education", "skills"], (path.name, text)


def test_score_halves_warnings() -> None:
    checks = [
        Check(id="a", category="layout", severity="medium", status="fail"),
        Check(id="b", category="layout", severity="high", status="warn"),
        Check(id="c", category="content", severity="high", status="fail"),
    ]
    assert score(checks, {"layout"}) == 100 - 12 - 15
    assert score(checks, {"content"}) == 70


def test_multi_column_reports_whether_template_expects_it() -> None:
    doc = ExtractedDocument(kind="pdf", text="x", page_count=1, pages=[])
    report = build_report(doc, source="render", template="swiss-two-column")
    check = next(c for c in report.checks if c.id == "multi_column")
    assert check.params["expected_by_template"] is True


# -- round trip --------------------------------------------------------------------


def _ordered_text(data: dict[str, Any]) -> list[str]:
    return [text for _, text in expected_fields(data)[0]]


def test_kendall_fidelity_bounds() -> None:
    assert kendall_fidelity([1, 2, 3, 4]) == 1.0
    assert kendall_fidelity([4, 3, 2, 1]) == 0.0


def test_roundtrip_in_order_and_shuffled() -> None:
    data = john_doe()
    parts = _ordered_text(data)
    exact = compute_roundtrip(data, "\n".join(parts))
    reverse = compute_roundtrip(data, "\n".join(reversed(parts)))
    assert exact.content_recall == 1.0 and exact.order_fidelity == 1.0
    assert reverse.content_recall == 1.0 and reverse.order_fidelity < 0.2


def test_roundtrip_reports_missing_and_hidden() -> None:
    data = john_doe()
    dropped = data["workExperience"][0]["description"][1]
    text = "\n".join(p for p in _ordered_text(data) if p != dropped)
    hidden = copy.deepcopy(data)
    for meta in hidden["sectionMeta"]:
        if meta["key"] == "education":
            meta["isVisible"] = False

    result = compute_roundtrip(data, text)
    by_field = {f.field: f.status for f in result.fields}
    assert by_field["workExperience[0].description[1]"] == "missing"
    assert result.content_recall < 1.0

    hidden_result = compute_roundtrip(hidden, text)
    statuses = {f.field: f.status for f in hidden_result.fields}
    assert statuses["section.education"] == "hidden"
    assert not any(name.startswith("education[") for name in statuses)


def test_roundtrip_word_satisfies_one_field_only() -> None:
    data = {
        "personalInfo": {"name": "Jane Roe", "title": "Python Developer"},
        "additional": {"technicalSkills": ["Python"]},
    }
    skill = "additional.technicalSkills"
    omitted = compute_roundtrip(data, "Jane Roe\nPython Developer")
    listed = compute_roundtrip(data, "Jane Roe\nPython Developer\nSkills\nPython")
    assert {f.field: f.status for f in omitted.fields}[skill] == "missing"
    assert {f.field: f.status for f in listed.fields}[skill] == "found"
    assert listed.content_recall == 1.0


def test_roundtrip_checks_rendered_locations() -> None:
    data = john_doe()
    data["workExperience"][0]["location"] = "Dublin, Ireland"
    data["customSections"]["volunteer"] = {
        "sectionType": "itemList",
        "items": [{"title": "Mentor", "subtitle": "Code Club", "location": "Leeds"}],
    }
    data["sectionMeta"].append(
        {
            "id": "volunteer",
            "key": "volunteer",
            "displayName": "Volunteering",
            "sectionType": "itemList",
            "isDefault": False,
            "order": 9,
        }
    )
    text = "\n".join(_ordered_text(data))
    assert "Dublin, Ireland" in text and "Leeds" in text
    dropped = text.replace("Dublin, Ireland", "").replace("Leeds", "")
    by_field = {f.field: f.status for f in compute_roundtrip(data, dropped).fields}
    assert by_field["workExperience[0].location"] == "missing"
    assert by_field["customSections.volunteer.items[0].location"] == "missing"


def test_roundtrip_validates_stored_data() -> None:
    with pytest.raises(ValidationError):
        compute_roundtrip({"workExperience": ["bogus"]}, "text")
    # Data without sectionMeta renders the default sections, as the print page does.
    legacy = {"workExperience": [{"title": "Staff Engineer", "company": "Acme"}]}
    fields = {f.field for f in compute_roundtrip(legacy, "Staff Engineer Acme").fields}
    assert {"workExperience[0].title", "workExperience[0].company"} <= fields
