import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBodyFontMap, buildHeaderFontMap } from '@/lib/types/template-settings';

// The preview renders in the reader's browser and the PDF in the server's Chromium,
// which have different local fonts (Segoe UI and Consolas on Windows, DejaVu in
// Docker). Every resume font stack must start with a face the app ships, or the
// two pick different fonts, wrap lines differently and break pages differently.
const BUNDLED = {
  serif: { family: 'Noto Serif', pkg: 'noto-serif' },
  'sans-serif': { family: 'Noto Sans', pkg: 'noto-sans' },
  mono: { family: 'Noto Sans Mono', pkg: 'noto-sans-mono' },
} as const;

const firstFamily = (stack: string): string =>
  stack
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '');
const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

/** Table tags of a WOFF 1.0 file. */
function woffTables(path: string): string[] {
  const bytes = readFileSync(path);
  const count = bytes.readUInt16BE(12);
  return Array.from({ length: count }, (_, i) =>
    bytes.subarray(44 + i * 20, 48 + i * 20).toString('latin1')
  );
}

describe('resume font stacks', () => {
  it.each(['en', 'es', 'zh', 'ja', 'ko', undefined])(
    'start with a bundled face for every font choice (locale %s)',
    (locale) => {
      for (const [choice, { family }] of Object.entries(BUNDLED) as [
        keyof typeof BUNDLED,
        { family: string },
      ][]) {
        expect(firstFamily(buildHeaderFontMap(locale)[choice])).toBe(family);
        expect(firstFamily(buildBodyFontMap(locale)[choice])).toBe(family);
      }
    }
  );

  it('starts the date and contact-line stack with the bundled mono face', () => {
    const stack = /--resume-font-mono:\s*([^;]+);/.exec(
      read('components/resume/styles/_tokens.css')
    )?.[1];
    expect(stack && firstFamily(stack)).toBe('Noto Sans Mono');
  });

  it('lays resume text out without font hinting', () => {
    // Hinting makes Chromium on Linux round each glyph to whole pixels, so the
    // same font measures wider or narrower there than on macOS or Windows.
    const body = /\.resume-body\s*\{([^}]*)\}/.exec(
      read('components/resume/styles/_base.module.css')
    )?.[1];
    expect(body).toMatch(/text-rendering:\s*geometricPrecision/);
  });

  it('loads every bundled face as static font files wherever a resume renders', () => {
    const component = read('components/dashboard/resume-component.tsx');
    for (const { family, pkg } of Object.values(BUNDLED)) {
      const sheets = [
        ...component.matchAll(new RegExp(`'@fontsource/${pkg}/([\\w-]+\\.css)'`, 'g')),
      ];
      expect(sheets.map((m) => m[1])).toEqual(expect.arrayContaining(['400.css', '700.css']));

      for (const [, sheet] of sheets) {
        const cssPath = require.resolve(`@fontsource/${pkg}/${sheet}`);
        const css = readFileSync(cssPath, 'utf8');
        expect(css).toContain(`font-family: '${family}'`);
        // Chromium writes a variable font (one with an fvar table) into the PDF as a
        // Type 3 font whose letters are unevenly spaced, in print and in extracted text.
        const woff = /url\(\.\/(files\/[\w-]+-latin-\d+-\w+\.woff)\)/.exec(css)?.[1];
        expect(woff, `${pkg}/${sheet} has a latin file`).toBeDefined();
        expect(woffTables(join(dirname(cssPath), woff!))).not.toContain('fvar');
      }
    }
  });
});
