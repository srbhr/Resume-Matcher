import { describe, expect, it } from 'vitest';
import { applyParams, getNestedValue } from '@/lib/i18n/utils';
import { getMessages } from '@/lib/i18n/messages';

/**
 * The translation engine (useTranslations / translate) is a thin wrapper over
 * these two pure functions. They decide what a missing key does and how
 * {placeholder} substitution works — the behavior every `t('a.b.c')` relies on.
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

describe('getNestedValue', () => {
  const tree = {
    common: { save: 'Save', nested: { deep: 'Deep value' } },
    count: 3,
  };

  it('resolves a top-level string key', () => {
    expect(getNestedValue({ hello: 'world' }, 'hello')).toBe('world');
  });

  it('resolves a nested dot path', () => {
    expect(getNestedValue(tree, 'common.save')).toBe('Save');
    expect(getNestedValue(tree, 'common.nested.deep')).toBe('Deep value');
  });

  it('returns the key itself when a segment is missing (no throw)', () => {
    // This is the contract: a missing translation renders the raw key, never crashes.
    expect(getNestedValue(tree, 'common.missing')).toBe('common.missing');
    expect(getNestedValue(tree, 'does.not.exist')).toBe('does.not.exist');
  });

  it('returns the path when it resolves to a non-string (object/number)', () => {
    expect(getNestedValue(tree, 'common')).toBe('common'); // object, not a leaf string
    expect(getNestedValue(tree, 'count')).toBe('count'); // number, not a string
  });

  it('round-trips a real nested leaf from the bundled en messages', () => {
    const en = getMessages('en') as unknown as Record<string, unknown>;
    const leaf = firstStringLeaf(en, '');
    expect(leaf).not.toBeNull();
    // The real message tree resolves an actual leaf path to its string value.
    expect(getNestedValue(en, leaf!.path)).toBe(leaf!.value);
  });
});

describe('applyParams', () => {
  it('returns the value unchanged when no params are given', () => {
    expect(applyParams('Hello {name}')).toBe('Hello {name}');
  });

  it('substitutes a single placeholder', () => {
    expect(applyParams('Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('substitutes multiple placeholders', () => {
    expect(applyParams('{greeting}, {name}!', { greeting: 'Hi', name: 'Ada' })).toBe('Hi, Ada!');
  });

  it('coerces numeric params to strings', () => {
    expect(applyParams('{count} items', { count: 5 })).toBe('5 items');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(applyParams('Hello {name}', { other: 'x' })).toBe('Hello {name}');
  });

  it('leaves a string with no placeholders unchanged', () => {
    expect(applyParams('Just text', { name: 'Ada' })).toBe('Just text');
  });
});
