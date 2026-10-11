import { afterEach, describe, expect, it, vi } from 'vitest';
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
