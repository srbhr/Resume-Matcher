"""Real Chromium checks of the resume page-break CSS (frontend globals.css and the
template stylesheets).

Reported on Discord: a large blank space after the Summary in the exported PDF,
with Experience starting on page 2, while the preview kept it on page 1.
Reordering the experiences made it go away.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

import pytest
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer
from playwright.async_api import async_playwright

from app.pdf import _launch_browser

REPO_ROOT = Path(__file__).resolve().parents[4]
GLOBALS_CSS = REPO_ROOT / "apps/frontend/app/(default)/css/globals.css"
TEMPLATE_STYLES = REPO_ROOT / "apps/frontend/components/resume/styles"

SUMMARY_SENTENCE = (
    "Biotechnologist with research and lab experience across molecular biology. "
)
LONG_BULLET = (
    "Translated and localized dialogue from English into Portuguese, keeping the "
    "narrative coherent, natural and suited to its context, and checked the original "
    "Japanese text to resolve ambiguities and stay faithful to the source material."
)


def _page_break_css() -> str:
    """The PAGE BREAK CONTROL block, exactly as the print route ships it."""
    css = GLOBALS_CSS.read_text()
    match = re.search(r"/\* =+\s+PAGE BREAK CONTROL.*?(?=/\* Home hero)", css, re.S)
    assert match, "PAGE BREAK CONTROL block not found in globals.css"
    return match.group(0)


def _entry(index: int, bullets: int) -> str:
    # Mirrors DescriptionList: each <li> is a flex row of a marker and the text.
    items = "".join(
        f'<li style="display:flex"><span>&bull;&nbsp;</span>'
        f"<span>Bullet {index}.{n} {LONG_BULLET}</span></li>"
        for n in range(1, bullets + 1)
    )
    return (
        f'<div data-resume-item="split">'
        f"<div><div><b>Entry {index}</b></div><div>Institute {index} | 2020 - 2022</div></div>"
        f"<ul>{items}</ul></div>"
    )


def _resume_html(entries: list[int], summary_repeats: int = 9) -> str:
    experience = "".join(_entry(i + 1, n) for i, n in enumerate(entries))
    return f"""<!doctype html><html><head><style>
      body {{ font: 11pt serif; margin: 0; }}
      ul {{ margin: 0; padding: 0; list-style: none; }}
      {_page_break_css()}
    </style></head><body>
      <h1>Synthetic Person</h1>
      <section data-resume-section>
        <h2 data-resume-section-title>SUMMARY</h2><p>{SUMMARY_SENTENCE * summary_repeats}</p>
      </section>
      <section data-resume-section>
        <h2 data-resume-section-title>EXPERIENCE</h2>
        <div style="display:flex;flex-direction:column;gap:6px">{experience}</div>
      </section>
    </body></html>"""


async def _pdf_pages(html: str) -> list[str]:
    playwright = await async_playwright().start()
    try:
        try:
            browser = await _launch_browser(playwright)
        except Exception as error:
            if "executable" in str(error).lower() or "installation" in str(error):
                pytest.skip(f"chromium unavailable: {error}")
            raise
        page = await browser.new_page()
        await page.set_content(html, wait_until="load")
        pdf = await page.pdf(format="A4", margin={"top": "10mm", "bottom": "10mm"})
        await browser.close()
    finally:
        await playwright.stop()
    return [
        "".join(el.get_text() for el in layout if isinstance(el, LTTextContainer))
        for layout in extract_pages(io.BytesIO(pdf))
    ]


async def test_consecutive_long_entries_do_not_push_experience_to_the_next_page() -> (
    None
):
    pages = await _pdf_pages(_resume_html([5, 4, 5, 4, 5, 4, 5, 4, 5, 4]))

    assert len(pages) >= 2
    assert "EXPERIENCE" in pages[0], "Experience was pushed to page 2, leaving a gap"
    assert "Entry 1" in pages[0]


async def test_an_entry_too_tall_for_the_page_splits_between_bullets() -> None:
    # A long summary leaves too little room on page 1 for this 10-bullet entry,
    # so it must split: whole-entry pagination would move it all to page 2.
    pages = await _pdf_pages(_resume_html([10], summary_repeats=65))

    def page_of(text: str) -> int:
        return next(i for i, page in enumerate(pages) if text in page)

    bullet_pages = [page_of(f"Bullet 1.{n} ") for n in range(1, 11)]
    assert page_of("Entry 1") == 0, "the entry was moved whole to page 2"
    assert bullet_pages[-1] > 0, "the entry did not split"
    # The header keeps its first two bullets, and the last two stay together.
    assert bullet_pages[0] == bullet_pages[1] == 0
    assert bullet_pages[-1] == bullet_pages[-2]


# --- Margins on flex-column items -------------------------------------------------
# Chromium mis-paginates a flex column whose items have margins: when an item's
# bottom margin crosses the page end, it moves the whole section to the next page.
# These pages use the real template stylesheets and fixed-height boxes, so the
# geometry doesn't depend on fonts, and sweep the page end through every pixel
# around an entry's or a section's end.


def _template_css(*modules: str) -> str:
    """CSS module files as written (class names unhashed), plus the page-break block."""
    css = "".join(
        re.sub(r"@import[^;]*;", "", (TEMPLATE_STYLES / name).read_text())
        for name in modules
    )
    return css + _page_break_css()


def _box_entry(index: int, height: int, split: bool) -> str:
    if not split:
        return (
            f'<div class="resume-item" data-resume-item style="height:{height}px">'
            f"Entry {index}</div>"
        )
    bullets = "".join(
        f'<li style="display:flex;height:25px"><span>Bullet {index}.{n}</span></li>'
        for n in range(1, 5)
    )
    return (
        f'<div class="resume-item" data-resume-item="split">'
        f'<div style="height:{height - 100}px">Entry {index}</div>'
        f'<ul style="margin:0;padding:0">{bullets}</ul></div>'
    )


def _box_resume_html(
    *,
    entries: int,
    split: bool,
    summary_height: int,
    columns: str | None = None,
    entry_list: str = "resume-items",
) -> str:
    """A resume page of fixed-height boxes.

    ``columns`` is a two-column template stylesheet (its ``.grid``/``.mainColumn``),
    and ``entry_list`` the class of the flex column holding the entries: the base
    ``resume-items``, or deedy's ``entries``.
    """

    def section(title: str, body: str) -> str:
        return (
            f'<div class="resume-section" data-resume-section>'
            f'<h3 class="resume-section-title" data-resume-section-title '
            f'style="height:20px;margin:0">{title}</h3>{body}</div>'
        )

    items = "".join(_box_entry(i, 130, split) for i in range(1, entries + 1))
    body = (
        f'<div class="resume-section" data-resume-section>'
        f'<div style="height:{summary_height}px">SUMMARY</div></div>'
        + section("EXPERIENCE", f'<div class="{entry_list}">{items}</div>')
        + section(
            "PROJECTS", f'<div class="{entry_list}">{_box_entry(99, 60, False)}</div>'
        )
    )
    modules = ["_base.module.css"]
    if entry_list == "entries":
        modules.append("deedy.module.css")
    if columns:
        modules.append(columns)
        body = (
            f'<div class="grid" style="margin-top:0"><div class="mainColumn">{body}</div>'
            f'<div class="sidebarColumn"><div class="resume-section" data-resume-section>'
            f"SKILLS</div></div></div>"
        )
    return (
        f"<!doctype html><html><head><style>body {{ margin: 0; font: 12px sans-serif; }}"
        f'{_template_css(*modules)}</style></head><body><div class="resume-body">{body}'
        f"</div></body></html>"
    )


async def _summary_heights_that_push_experience(
    summary_heights: range, **layout: object
) -> list[int]:
    """Summary heights at which EXPERIENCE does not start on page 1."""
    playwright = await async_playwright().start()
    pushed = []
    try:
        try:
            browser = await _launch_browser(playwright)
        except Exception as error:
            if "executable" in str(error).lower() or "installation" in str(error):
                pytest.skip(f"chromium unavailable: {error}")
            raise
        page = await browser.new_page()
        for height in summary_heights:
            await page.set_content(_box_resume_html(summary_height=height, **layout))
            pdf = await page.pdf(format="A4", margin={"top": "10mm", "bottom": "10mm"})
            first = next(extract_pages(io.BytesIO(pdf)))
            text = "".join(
                el.get_text() for el in first if isinstance(el, LTTextContainer)
            )
            if "EXPERIENCE" not in text:
                pushed.append(height)
        await browser.close()
    finally:
        await playwright.stop()
    return pushed


# Summary heights that put an entry's end at the bottom of page 1, per entry list.
SWEEP_ENTRY = {"resume-items": range(140, 166), "entries": range(120, 146)}

TWO_COLUMN_TEMPLATES = [
    "swiss-two-column.module.css",
    "modern-two-column.module.css",
    "vivid.module.css",
]


@pytest.mark.parametrize("entry_list", ["resume-items", "entries"])
async def test_an_entry_margin_at_the_page_end_does_not_push_the_section(
    entry_list: str,
) -> None:
    # An entry that may split ends near the bottom of page 1.
    pushed = await _summary_heights_that_push_experience(
        SWEEP_ENTRY[entry_list], entries=8, split=True, entry_list=entry_list
    )
    assert pushed == [], f"Experience moved to page 2 at summary heights {pushed}"


async def test_an_entry_margin_at_the_page_end_does_not_push_the_section_two_column() -> (
    None
):
    pushed = await _summary_heights_that_push_experience(
        range(124, 150), entries=8, split=True, columns=TWO_COLUMN_TEMPLATES[0]
    )
    assert pushed == [], f"Experience moved to page 2 at summary heights {pushed}"


@pytest.mark.parametrize("columns", TWO_COLUMN_TEMPLATES)
async def test_a_section_margin_at_the_page_end_does_not_push_the_section(
    columns: str,
) -> None:
    # The whole Experience section ends near the bottom of page 1.
    pushed = await _summary_heights_that_push_experience(
        range(528, 562), entries=3, split=False, columns=columns
    )
    assert pushed == [], f"Experience moved to page 2 at summary heights {pushed}"
