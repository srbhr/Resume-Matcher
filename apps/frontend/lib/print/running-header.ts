/**
 * Running header for multi-page resume PDFs: "Name · 2 / 3" in the top-right
 * margin of every page except the first. Single-page resumes are unchanged,
 * because `@page :first` clears it.
 *
 * Chromium (131+) renders CSS `@page` margin boxes into the PDF text layer.
 * Measured with the ATS parse-check: score, recall and reading order are the
 * same with and without it.
 */

/** Escape a value into a CSS string literal using only [A-Za-z0-9 ] plus hex escapes. */
export function cssString(value: string): string {
  let out = '';
  for (const char of value) {
    out += /[A-Za-z0-9 ]/.test(char) ? char : `\\${char.codePointAt(0)!.toString(16)} `;
  }
  return `"${out}"`;
}

/** The `@page` rules for the running header. `name` may be empty. */
export function runningHeaderCss(name: string | null | undefined): string {
  const trimmed = (name ?? '').replace(/\s+/g, ' ').trim();
  const prefix = trimmed ? `${cssString(`${trimmed} · `)} ` : '';
  return [
    '@page {',
    '  @top-right {',
    `    content: ${prefix}counter(page) " / " counter(pages);`,
    '    font: 7.5pt/1 Helvetica, Arial, sans-serif;',
    '    color: #6b6b6b;',
    '    vertical-align: bottom;',
    '    padding-bottom: 2mm;',
    '  }',
    '}',
    '@page :first {',
    '  @top-right { content: none; }',
    '}',
  ].join('\n');
}
