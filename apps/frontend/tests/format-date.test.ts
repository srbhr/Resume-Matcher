import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/format-date';

describe('formatDate', () => {
  it('formats in the UI locale', () => {
    expect(formatDate('2026-03-05T12:00:00Z', 'en')).toBe('Mar 5, 2026');
    expect(formatDate('2026-03-05T12:00:00Z', 'de')).toBe('5. März 2026');
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatDate(null, 'en')).toBe('');
    expect(formatDate('not a date', 'en')).toBe('');
  });

  it('falls back to English for an unusable locale tag', () => {
    expect(formatDate('2026-03-05T12:00:00Z', 'xx-INVALID-TAG-123')).toBe('Mar 5, 2026');
  });
});
