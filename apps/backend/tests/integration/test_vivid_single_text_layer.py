"""Real-browser PDF text layer of the Vivid single-column styles.

The two-column Vivid draws its lighter surname with ``opacity`` and its section
titles and roles in small caps. Both reach the PDF text layer badly: opacity wraps
the text in a transparency group that an ATS counts as an image and may skip, and
small caps become private-use glyphs on some fonts. vivid-single styles those spots
with plain colour and real capitals instead.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from playwright.async_api import async_playwright

from app.pdf import _launch_browser
from app.services.ats_parse.extract import ExtractedDocument, extract_pdf

REPO_ROOT = Path(__file__).resolve().parents[4]
STYLE_ROOT = REPO_ROOT / "apps/frontend/components/resume/styles"
PRIVATE_USE = re.compile(r"[-]")


def _css(name: str) -> str:
    """Real CSS without the file-only @import (unsupported by set_content)."""
    lines = (STYLE_ROOT / name).read_text().splitlines()
    return "\n".join(line for line in lines if not line.startswith("@import"))


async def _extract(surname_class: str) -> ExtractedDocument:
    playwright = await async_playwright().start()
    try:
        browser = await _launch_browser(playwright)
    except NotImplementedError:
        await playwright.stop()
        pytest.skip("Chromium subprocesses are unsupported by this event loop")
    except Exception as error:
        await playwright.stop()
        if "executable" in str(error).lower() or "installation was found" in str(error):
            pytest.skip(f"chromium unavailable: {error}")
        raise
    try:
        page = await browser.new_page()
        # CSS Modules `composes` is resolved by the build; here each element lists both.
        # The sans header font is the one that turns small caps into private-use glyphs.
        await page.set_content(
            f"""
            <style>
              {_css("_tokens.css")}
              {_css("_base.module.css")}
              {_css("vivid.module.css")}
            </style>
            <main class="resume-body" style="--header-font: ui-sans-serif, system-ui, sans-serif">
              <h1 class="resume-name">
                <span class="nameFirst">Sarah</span><span class="{surname_class}"> Chen</span>
              </h1>
              <h3 class="sectionTitle sectionTitleCaps">Experience</h3>
              <span class="entryCompany">Fernway Payments</span>
              <span class="entrySep">|</span>
              <span class="entryRole entryRoleCaps">Senior Software Engineer</span>
            </main>
            """,
            wait_until="load",
        )
        await page.emulate_media(media="print")
        pdf = await page.pdf(format="A4", print_background=True)
    finally:
        await browser.close()
        await playwright.stop()
    return extract_pdf(pdf)


async def test_vivid_single_text_layer_is_complete_capitals_and_image_free() -> None:
    doc = await _extract("nameRestSolid")
    assert doc.images == 0
    assert "Sarah Chen" in doc.text
    assert "EXPERIENCE" in doc.text
    assert "SENIOR SOFTWARE ENGINEER" in doc.text
    assert not PRIVATE_USE.search(doc.text)


async def test_two_column_vivid_opacity_surname_is_what_the_solid_tint_avoids() -> None:
    doc = await _extract("nameRest")
    assert doc.images == 1
