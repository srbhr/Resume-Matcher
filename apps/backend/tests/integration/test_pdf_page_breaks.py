"""Real Chromium checks of the resume page-break CSS (frontend globals.css).

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

SUMMARY = (
    "Biotechnologist with research and lab experience across molecular biology. " * 9
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
        f'<li style="display:flex"><span>&bull;&nbsp;</span><span>{LONG_BULLET}</span></li>'
        for _ in range(bullets)
    )
    return (
        f'<div data-resume-item="split">'
        f"<div><div><b>Entry {index}</b></div><div>Institute {index} | 2020 - 2022</div></div>"
        f"<ul>{items}</ul></div>"
    )


def _resume_html(entries: list[int]) -> str:
    experience = "".join(_entry(i + 1, n) for i, n in enumerate(entries))
    return f"""<!doctype html><html><head><style>
      body {{ font: 11pt serif; margin: 0; }}
      ul {{ margin: 0; padding: 0; list-style: none; }}
      {_page_break_css()}
    </style></head><body>
      <h1>Synthetic Person</h1>
      <section data-resume-section>
        <h2 data-resume-section-title>SUMMARY</h2><p>{SUMMARY}</p>
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


async def test_a_long_entry_still_splits_only_between_bullets() -> None:
    pages = await _pdf_pages(_resume_html([5, 4, 5, 4, 5, 4, 5, 4, 5, 4]))

    # Every entry's header shares a page with at least its first bullet.
    for index in range(1, 11):
        header_page = next(
            i for i, text in enumerate(pages) if f"Entry {index}" in text
        )
        after_header = pages[header_page].split(f"Entry {index}", 1)[1]
        assert "Translated" in after_header, f"Entry {index}'s header was left alone"
