import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_COLOR } from '@/lib/theme-color';

const CSS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/(default)/css/globals.css'),
  'utf8'
);

function token(name: string): string {
  const match = CSS.match(new RegExp(`--sw-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`--sw-${name} must be defined as a 6-digit hex in globals.css`);
  return match[1].toLowerCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text and text-on-fill pairs the UI actually uses (spec §4.1). 4.5:1 each.
const TEXT_PAIRS: Array<[string, string]> = [
  ['ink-soft', 'canvas'],
  ['ink-soft', 'white'],
  ['ink-soft', 'panel'],
  ['ink-soft', 'paper'],
  ['steel', 'canvas'],
  ['steel', 'white'],
  ['steel', 'paper'],
  ['primary', 'canvas'],
  ['primary', 'white'],
  ['success', 'canvas'],
  ['success', 'white'],
  ['destructive', 'canvas'],
  ['destructive', 'white'],
  ['warning-text', 'canvas'],
  ['warning-text', 'white'],
  ['white', 'primary'],
  ['white', 'primary-hover'],
  ['white', 'success'],
  ['white', 'success-hover'],
  ['white', 'destructive'],
  ['white', 'destructive-hover'],
  ['white', 'ink'],
  ['ink', 'warning'],
  ['ink', 'warning-hover'],
  ['ink', 'panel'],
  ['ink', 'panel-hover'],
  ['ink', 'highlight'],
  ['ink', 'canvas'],
  ['primary', 'info-tint'],
  ['success', 'success-tint'],
  ['warning-text', 'warning-tint'],
  ['destructive', 'destructive-tint'],
  ['ink-soft', 'info-tint'],
  ['ink-soft', 'success-tint'],
  ['ink-soft', 'warning-tint'],
  ['ink-soft', 'destructive-tint'],
];

// Non-text graphics that carry meaning on their own (SC 1.4.11). 3:1 each.
const GRAPHIC_PAIRS: Array<[string, string]> = [
  ['primary', 'canvas'],
  ['primary', 'white'],
  ['success', 'canvas'],
  ['success', 'white'],
  ['destructive', 'canvas'],
  ['destructive', 'white'],
  ['ink', 'canvas'],
  ['ink', 'white'],
];

describe('Swiss palette contrast (WCAG 2.2 AA)', () => {
  it.each(TEXT_PAIRS)('%s text on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHIC_PAIRS)('%s graphic on %s is at least 3:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });

  it('pins the warning fill, which is exempt from 1.4.11 because it never carries meaning alone', () => {
    // Spec §9.2: every warning square has a label, every warning alert has a
    // warning-text label on a tint, and warning buttons have an ink border and
    // ink text. Changing this value is a design decision — update the spec too.
    expect(token('warning')).toBe('#f97316');
    expect(contrast(token('ink'), token('warning'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps steel off panel (4.11:1 fails)', () => {
    expect(contrast(token('steel'), token('panel'))).toBeLessThan(4.5);
  });

  it('keeps the browser theme colour in sync with canvas', () => {
    expect(THEME_COLOR.toLowerCase()).toBe(token('canvas'));
  });
});
