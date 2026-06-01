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

type Kind = 'branch' | 'leaf';

function keyKinds(obj: unknown, prefix = '', out: Map<string, Kind> = new Map()): Map<string, Kind> {
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const isBranch = !!val && typeof val === 'object';
    out.set(path, isBranch ? 'branch' : 'leaf');
    if (isBranch) keyKinds(val, path, out);
  }
  return out;
}

const REFERENCE = keyKinds(en);
const LOCALES: Record<string, unknown> = { es, zh, ja, pt };

describe('i18n locale parity (guards the next build break)', () => {
  it.each(Object.keys(LOCALES))('%s.json matches en.json key structure exactly', (name) => {
    const localeKinds = keyKinds(LOCALES[name]);
    const missing = [...REFERENCE.keys()].filter((k) => !localeKinds.has(k));
    const extra = [...localeKinds.keys()].filter((k) => !REFERENCE.has(k));
    // A key present in BOTH but with a different shape (object vs string) keeps
    // the path present yet still breaks `next build` — a presence-only check
    // misses it. Compare the node KIND, not just the key path.
    const mismatched = [...REFERENCE.keys()].filter(
      (k) => localeKinds.has(k) && localeKinds.get(k) !== REFERENCE.get(k)
    );
    expect(missing, `${name}.json is MISSING keys present in en.json`).toEqual([]);
    expect(mismatched, `${name}.json has keys whose SHAPE differs from en.json`).toEqual([]);
    expect(extra, `${name}.json has EXTRA keys not in en.json`).toEqual([]);
  });

  it('reference (en.json) has a non-trivial number of keys', () => {
    // Guards against the check silently passing on an empty/garbled reference.
    expect(REFERENCE.size).toBeGreaterThan(20);
  });

  it('detects a leaf-vs-object shape mismatch, not just missing keys', () => {
    // Proves the kind-aware comparison fires on the exact gap a presence-only
    // set-diff would let through (cubic review, PR #820).
    const ref = keyKinds({ a: { b: 'str' } });
    const bad = keyKinds({ a: { b: { c: 'deep' } } }); // a.b is an object here
    const mismatched = [...ref.keys()].filter((k) => bad.has(k) && bad.get(k) !== ref.get(k));
    expect(mismatched).toContain('a.b');
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
