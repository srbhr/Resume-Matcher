import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import zh from '@/messages/zh.json';
import ja from '@/messages/ja.json';
import pt from '@/messages/pt-BR.json';

import { getMessages } from '@/lib/i18n/messages';
import { locales, type Locale } from '@/i18n/config';

/**
 * `lib/i18n/messages.ts` declares `type Messages = typeof en` and
 * `Record<Locale, Messages>`, so every locale JSON must structurally match
 * en.json — a *missing* key makes `tsc` / `next build` fail. That exact drift
 * once shipped to main and only surfaced post-merge in the Docker build.
 *
 * This catches it in-suite (and mirrors scripts/check_locale_parity.py, which
 * the pre-push hook runs without Node).
 */

function keyPaths(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const out: string[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(path);
    out.push(...keyPaths(val, path));
  }
  return out;
}

const REFERENCE = keyPaths(en).sort();
const refSet = new Set(REFERENCE);
const LOCALES: Record<string, unknown> = { es, zh, ja, pt };

describe('i18n locale parity (guards the next build break)', () => {
  it.each(Object.keys(LOCALES))('%s.json matches en.json key structure exactly', (name) => {
    const keys = keyPaths(LOCALES[name]).sort();
    const keySet = new Set(keys);
    const missing = REFERENCE.filter((k) => !keySet.has(k));
    const extra = keys.filter((k) => !refSet.has(k));
    // Missing keys are build-breaking; extra keys are drift. Locales should be identical.
    expect(missing, `${name}.json is MISSING keys present in en.json`).toEqual([]);
    expect(extra, `${name}.json has EXTRA keys not in en.json`).toEqual([]);
  });

  it('reference (en.json) has a non-trivial number of keys', () => {
    // Guards against the check silently passing on an empty/garbled reference.
    expect(REFERENCE.length).toBeGreaterThan(20);
  });
});

describe('getMessages', () => {
  it('resolves every locale declared in i18n/config to a populated object', () => {
    for (const locale of locales) {
      const msgs = getMessages(locale) as Record<string, unknown>;
      expect(Object.keys(msgs).length).toBeGreaterThan(0);
    }
  });

  it('falls back to en for an unknown locale', () => {
    expect(getMessages('xx' as unknown as Locale)).toBe(getMessages('en'));
  });
});
