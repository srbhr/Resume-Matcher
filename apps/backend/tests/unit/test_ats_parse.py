"""ATS parse-check engine: normalization, checks, scoring and round trip."""

import copy
import io
import json
from pathlib import Path
from typing import Any

import pytest
from docx import Document

from app.services.ats_parse import build_report, parse_check_bytes
from app.services.ats_parse.checks import has_columns, run_checks, score
from app.services.ats_parse.extract import ExtractedDocument, PageLayout, TextBox
from app.services.ats_parse.headings import HEADINGS
from app.services.ats_parse.models import Check
from app.services.ats_parse.normalize import normalize, rejoin_letter_spacing
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


# -- normalize -----------------------------------------------------------------


def test_letter_spaced_headings_are_rejoined() -> None:
    assert rejoin_letter_spacing("S U M M A R Y") == "SUMMARY"
    assert normalize("E X P E R I E N C E\nAcme") == "experience\nacme"
    assert rejoin_letter_spacing("I am a dev") == "I am a dev"


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


async def test_pdf_without_text_is_not_extractable() -> None:
    report = await parse_check_bytes(_pdf(1), "scan.pdf")
    assert report.extractability == "none"
    assert _status(report.checks, "text_layer") == "fail"


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


# -- content ---------------------------------------------------------------------


def test_contact_info_found_late_is_a_warning() -> None:
    early = run_checks(
        _text_doc("Jane jane@x.com +1 415 555 0100\n" + "word " * 200), {}
    )
    late = run_checks(_text_doc("word " * 200 + "jane@x.com +1 415 555 0100"), {})
    assert _status(early, "contact_info") == "pass"
    assert _status(late, "contact_info") == "warn"


@pytest.mark.parametrize(
    ("text", "locale", "status"),
    [
        ("Experiencia\nEducación\nHabilidades", "es", "pass"),
        ("Experience\nEducation\nSkills", "ja", "pass"),
        ("Experience\nSkills", None, "warn"),
        ("Experience with Python and teams across many offices", None, "fail"),
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
