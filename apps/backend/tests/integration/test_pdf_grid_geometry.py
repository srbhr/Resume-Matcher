"""Real-browser geometry, PDF-text and raster checks for two-column CSS."""

from __future__ import annotations

import io
import shutil
import struct
import subprocess
from pathlib import Path
from typing import Any

import pytest
from pdfminer.high_level import extract_text
from playwright.async_api import async_playwright

from app.pdf import _launch_browser


REPO_ROOT = Path(__file__).resolve().parents[4]
STYLE_ROOT = REPO_ROOT / "apps/frontend/components/resume/styles"
TEMPLATE_STYLES = (
    "vivid.module.css",
    "swiss-two-column.module.css",
    "modern-two-column.module.css",
)
PAGE_WIDTH_MM = {"A4": 210.0, "Letter": 215.9}


def _load_browser_css(path: Path) -> str:
    """Load real CSS while removing file-only imports unsupported in set_content."""
    return "\n".join(
        line for line in path.read_text().splitlines() if not line.startswith("@import")
    )


def _png_dimensions(png: bytes) -> tuple[int, int]:
    """Read dimensions from a PNG IHDR without adding a Pillow dependency."""
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    return struct.unpack(">II", png[16:24])


async def test_two_column_css_fits_real_pdf_widths_and_preserves_long_text(
    tmp_path: Path,
) -> None:
    """Actual template CSS must fit every tested printable width without clipping."""
    tokens_css = _load_browser_css(STYLE_ROOT / "_tokens.css")
    base_css = _load_browser_css(STYLE_ROOT / "_base.module.css")
    rasterizer = shutil.which("pdftoppm")

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
        for style_name in TEMPLATE_STYLES:
            template_css = _load_browser_css(STYLE_ROOT / style_name)
            for pdf_format, margin_mm, section_gap_px in (
                ("A4", 5, 4),
                ("A4", 25, 20),
                ("Letter", 5, 20),
                ("Letter", 25, 4),
            ):
                printable_width_px = (
                    PAGE_WIDTH_MM[pdf_format] - (2 * margin_mm)
                ) * 96 / 25.4
                html = f"""
                    <style>
                      * {{ box-sizing: border-box; }}
                      html, body {{ margin: 0; width: {printable_width_px}px; }}
                      {tokens_css}
                      {base_css}
                      {template_css}
                      .resume-print, .resume-body {{
                        width: {printable_width_px}px;
                        --margin-top: 0; --margin-right: 0;
                        --margin-bottom: 0; --margin-left: 0;
                        --section-gap: {section_gap_px}px;
                        --item-gap: 8px;
                      }}
                    </style>
                    <main class="resume-print resume-body">
                      <header class="resume-header"><h1>Geometry Candidate</h1></header>
                      <div class="grid" data-grid>
                        <section class="mainColumn">
                          <h2>Experience</h2>
                          <p>Built reliable systems with measurable operational outcomes.</p>
                        </section>
                        <aside class="sidebarColumn" data-sidebar>
                          <h2>Skills</h2>
                          <span class="resume-skill-pill" data-probe>
                            PostgreSQLObservabilityToolkit
                          </span>
                          <h2>Links</h2>
                          <a class="resume-link" data-probe
                             href="https://github.com/synthetic-candidate/observability-platform">
                            github.com/synthetic-candidate/observability-platform
                          </a>
                        </aside>
                      </div>
                    </main>
                """
                await page.set_content(html, wait_until="load")
                await page.emulate_media(media="print")

                geometry: dict[str, Any] = await page.evaluate(
                    """() => {
                      const grid = document.querySelector('[data-grid]');
                      const sidebar = document.querySelector('[data-sidebar]');
                      const children = Array.from(grid.children);
                      const gridRect = grid.getBoundingClientRect();
                      const sidebarRect = sidebar.getBoundingClientRect();
                      const gap = parseFloat(getComputedStyle(grid).columnGap);
                      return {
                        gridWidth: gridRect.width,
                        occupiedWidth:
                          children.reduce((sum, child) =>
                            sum + child.getBoundingClientRect().width, 0) + gap,
                        gridScrollWidth: grid.scrollWidth,
                        gridClientWidth: grid.clientWidth,
                        sidebarScrollWidth: sidebar.scrollWidth,
                        sidebarClientWidth: sidebar.clientWidth,
                        probesInside: Array.from(document.querySelectorAll('[data-probe]'))
                          .every((node) => {
                            const rect = node.getBoundingClientRect();
                            return rect.left >= sidebarRect.left - 0.5 &&
                              rect.right <= sidebarRect.right + 0.5;
                          }),
                      };
                    }"""
                )
                assert abs(geometry["occupiedWidth"] - geometry["gridWidth"]) < 1
                assert geometry["gridScrollWidth"] <= geometry["gridClientWidth"] + 1
                assert (
                    geometry["sidebarScrollWidth"]
                    <= geometry["sidebarClientWidth"] + 1
                )
                assert geometry["probesInside"] is True

                pdf = await page.pdf(
                    format=pdf_format,
                    print_background=True,
                    margin={
                        side: f"{margin_mm}mm"
                        for side in ("top", "right", "bottom", "left")
                    },
                )
                extracted = extract_text(io.BytesIO(pdf))
                compacted_text = "".join(extracted.split())
                assert "PostgreSQL" in extracted
                assert (
                    "github.com/synthetic-candidate/observability-platform"
                    in compacted_text
                )

                if rasterizer is not None:
                    case_name = (
                        f"{style_name.removesuffix('.module.css')}-{pdf_format}-"
                        f"{margin_mm}-{section_gap_px}"
                    )
                    pdf_path = tmp_path / f"{case_name}.pdf"
                    png_prefix = tmp_path / case_name
                    pdf_path.write_bytes(pdf)
                    subprocess.run(
                        [rasterizer, "-png", "-singlefile", str(pdf_path), str(png_prefix)],
                        check=True,
                        capture_output=True,
                    )
                    raster = (tmp_path / f"{case_name}.png").read_bytes()
                    width, height = _png_dimensions(raster)
                    assert width > 1000
                    assert height > 1000
    finally:
        await browser.close()
        await playwright.stop()
