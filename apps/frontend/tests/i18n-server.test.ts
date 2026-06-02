import { describe, expect, it } from 'vitest';
import { translate } from '@/lib/i18n/server';
import { getMessages } from '@/lib/i18n/messages';
import type { Locale } from '@/i18n/config';

/**
 * `translate()` is the server-side i18n entry used by the print/* pages that
 * headless Chromium renders into PDFs. It composes getMessages + getNestedValue
 * + applyParams, so these tests pin that composition end-to-end.
 */

function firstStringLeaf(
  obj: Record<string, unknown>,
  prefix: string
): { path: string; value: string } | null {
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'string') return { path, value: val };
    if (val && typeof val === 'object') {
      const found = firstStringLeaf(val as Record<string, unknown>, path);
      if (found) return found;
    }
  }
  return null;
}

const leaf = firstStringLeaf(getMessages('en') as unknown as Record<string, unknown>, '')!;

describe('translate (server-side)', () => {
  it('resolves a real key in the requested locale', () => {
    expect(translate('en', leaf.path)).toBe(leaf.value);
  });

  it('returns the key itself when missing', () => {
    expect(translate('en', 'totally.missing.key')).toBe('totally.missing.key');
  });

  it('falls back to en for an unknown locale', () => {
    expect(translate('xx' as unknown as Locale, leaf.path)).toBe(translate('en', leaf.path));
  });

  it('composes lookup + param substitution (missing path still gets params applied)', () => {
    // getNestedValue returns the raw path 'nope.{n}', then applyParams fills {n}.
    expect(translate('en', 'nope.{n}', { n: 5 })).toBe('nope.5');
  });
});
