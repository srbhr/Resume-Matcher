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

// Classify a JSON value by the type `typeof en` infers (object/array/string/…).
// Note arrays and null are `typeof === 'object'` in JS, so they must be handled
// before the generic object case — this keeps the classification in lock-step
// with scripts/check_locale_parity.py (where lists/None are NOT objects).
function nodeKind(v: unknown): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (typeof v === 'object') return 'object';
  return typeof v; // 'string' | 'number' | 'boolean'
}

function keyKinds(obj: unknown, prefix = '', out: Map<string, string> = new Map()): Map<string, string> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.set(path, nodeKind(val));
    if (val && typeof val === 'object' && !Array.isArray(val)) keyKinds(val, path, out);
  }
  return out;
}

const REFERENCE = keyKinds(en);
const LOCALES: Record<string, unknown> = { es, zh, ja, pt };

describe('i18n locale parity (guards the next build break)', () => {
  it.each(Object.keys(LOCALES))('%s.json has every en.json key with a matching shape', (name) => {
    const localeKinds = keyKinds(LOCALES[name]);
    const missing = [...REFERENCE.keys()].filter((k) => !localeKinds.has(k));
    const extra = [...localeKinds.keys()].filter((k) => !REFERENCE.has(k));
    // A key present in BOTH but with a different shape (object vs string) keeps
    // the path present yet still breaks `next build` — a presence-only check
    // misses it. Compare the node KIND, not just the key path.
    const mismatched = [...REFERENCE.keys()].filter(
      (k) => localeKinds.has(k) && localeKinds.get(k) !== REFERENCE.get(k)
    );
    // Only MISSING or SHAPE-MISMATCHED keys break `type Messages = typeof en`
    // (and therefore `next build`). EXTRA keys are still assignable to the
    // en-derived type, so they are NON-FATAL — surfaced as a warning, never a
    // failure, to stay in lock-step with scripts/check_locale_parity.py (which
    // reports extras as `⚠ (non-fatal)`). See that script's module docstring.
    expect(missing, `${name}.json is MISSING keys present in en.json`).toEqual([]);
    expect(mismatched, `${name}.json has keys whose SHAPE differs from en.json`).toEqual([]);
    if (extra.length > 0) {
      console.warn(`locale-parity: ${name}.json has extra keys not in en.json (non-fatal): ${extra.join(', ')}`);
    }
  });

  it('reference (en.json) has a non-trivial number of keys', () => {
    // Guards against the check silently passing on an empty/garbled reference.
    expect(REFERENCE.size).toBeGreaterThan(20);
  });

  it('detects shape mismatches by JSON type (object / number / array vs string)', () => {
    // Proves the kind-aware comparison fires on the exact gaps a presence-only
    // set-diff would let through (cubic review, PR #820) — including primitive
    // and array mismatches, not just object-vs-string.
    const ref = keyKinds({ a: { b: 'str' } });
    const diff = (other: Map<string, string>) =>
      [...ref.keys()].filter((k) => other.has(k) && other.get(k) !== ref.get(k));
    expect(diff(keyKinds({ a: { b: { c: 'deep' } } }))).toContain('a.b'); // object
    expect(diff(keyKinds({ a: { b: 5 } }))).toContain('a.b'); // number
    expect(diff(keyKinds({ a: { b: ['x'] } }))).toContain('a.b'); // array
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
