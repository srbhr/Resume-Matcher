import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatTimeAgo } from '@/lib/format-date';

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

describe('formatDate: formatter cache', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds one Intl.DateTimeFormat per locale and options, however often it is called', () => {
    const construct = vi.spyOn(Intl, 'DateTimeFormat');
    const options: Intl.DateTimeFormatOptions = { year: '2-digit', month: 'narrow' };
    for (let i = 0; i < 50; i++) {
      // A fresh options object each call, as the list rows pass inline literals.
      formatDate('2026-03-05T12:00:00Z', 'en', { ...options });
      formatDate('2026-03-05T12:00:00Z', 'fr', { ...options });
    }
    expect(construct).toHaveBeenCalledTimes(2);
  });

  it('keeps locales and options apart', () => {
    expect(formatDate('2026-03-05T12:00:00Z', 'en', { month: 'long' })).toBe('March');
    expect(formatDate('2026-03-05T12:00:00Z', 'en', { month: 'short' })).toBe('Mar');
    expect(formatDate('2026-03-05T12:00:00Z', 'de', { month: 'long' })).toBe('März');
  });

  it('builds the English fallback once for an unusable locale, not on every call', () => {
    const construct = vi.spyOn(Intl, 'DateTimeFormat');
    for (let i = 0; i < 10; i++)
      formatDate('2026-03-05T12:00:00Z', 'xx-BAD-TAG-9', { day: '2-digit' });
    // The failed attempt and the fallback, once.
    expect(construct).toHaveBeenCalledTimes(2);
  });
});

describe('formatDate: date-only values', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  /** Runs formatDate under a forced timezone, on a fresh module so no formatter cached under another zone is reused. */
  async function formatIn(tz: string, value: string, locale = 'en') {
    process.env.TZ = tz;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz);
    vi.resetModules();
    const { formatDate } = await import('@/lib/format-date');
    return formatDate(value, locale);
  }

  // `new Date('2025-01-02')` is UTC midnight, which is still Jan 1 in the zones west of UTC.
  it.each(['America/Los_Angeles', 'Pacific/Honolulu', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati'])(
    'keeps the calendar day of a YYYY-MM-DD value in %s',
    async (tz) => {
      expect(await formatIn(tz, '2025-01-02')).toBe('Jan 2, 2025');
      expect(await formatIn(tz, '2025-12-31', 'de')).toBe('31. Dez. 2025');
    }
  );

  it('still reads a full ISO timestamp as the instant it names', async () => {
    expect(await formatIn('America/Los_Angeles', '2025-01-02T03:00:00Z')).toBe('Jan 1, 2025');
  });
});

describe('formatTimeAgo', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');

  it('picks the largest unit that fits', () => {
    expect(formatTimeAgo('2026-11-27T11:59:55Z', 'en', now)).toBe('5 seconds ago');
    expect(formatTimeAgo('2026-11-27T11:30:00Z', 'en', now)).toBe('30 minutes ago');
    expect(formatTimeAgo('2026-11-27T09:00:00Z', 'en', now)).toBe('3 hours ago');
    expect(formatTimeAgo('2026-11-25T12:00:00Z', 'en', now)).toBe('2 days ago');
    expect(formatTimeAgo('2026-11-13T12:00:00Z', 'en', now)).toBe('2 weeks ago');
    expect(formatTimeAgo('2026-08-27T12:00:00Z', 'en', now)).toBe('3 months ago');
    expect(formatTimeAgo('2024-11-27T12:00:00Z', 'en', now)).toBe('2 years ago');
  });

  it('says now for the present, and for a time after it', () => {
    expect(formatTimeAgo(now, 'en', now)).toBe('now');
    expect(formatTimeAgo('2026-11-27T12:00:30Z', 'en', now)).toBe('now');
    expect(formatTimeAgo('2026-11-26T12:00:00Z', 'en', now)).toBe('yesterday');
  });

  it('speaks the UI locale', () => {
    expect(formatTimeAgo('2026-11-25T12:00:00Z', 'es', now)).toBe('anteayer');
    expect(formatTimeAgo('2026-11-24T12:00:00Z', 'fr', now)).toBe('il y a 3 jours');
  });

  it('returns nothing for missing or invalid input', () => {
    expect(formatTimeAgo(null, 'en', now)).toBe('');
    expect(formatTimeAgo('', 'en', now)).toBe('');
    expect(formatTimeAgo('not a date', 'en', now)).toBe('');
  });
});
