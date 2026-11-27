const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `new Date('2025-01-02')` is UTC midnight, which reads as Jan 1 west of UTC: a bare date is a calendar day, so build it locally. */
function toDate(value: string | number | Date): Date {
  if (typeof value === 'string') {
    const m = DATE_ONLY.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return value instanceof Date ? value : new Date(value);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** One formatter per locale and options: building one is far costlier than formatting, and lists call this once per row. */
function formatterFor(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(locale, options);
    } catch {
      formatter = new Intl.DateTimeFormat('en', options);
    }
    formatters.set(key, formatter);
  }
  return formatter;
}

/** Formats a date in the UI locale. Returns '' for missing or invalid input. */
export function formatDate(
  value: string | number | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_OPTIONS
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatterFor(locale, options).format(date);
}

const DAY_MS = 86_400_000;

/**
 * Whole calendar days from `earlier` to `later` in the local time zone: 1 for
 * any time yesterday, however few hours ago. Counted between local midnights,
 * so a 23- or 25-hour day at a clock change still counts as one.
 */
export function calendarDaysBetween(earlier: number, later: number): number {
  const midnight = (time: number) => {
    const d = new Date(time);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  return Math.round((midnight(later) - midnight(earlier)) / DAY_MS);
}

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  let formatter = relativeFormatters.get(locale);
  if (!formatter) {
    try {
      formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    } catch {
      formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    }
    relativeFormatters.set(locale, formatter);
  }
  return formatter;
}

/** "Today", "yesterday", "3 days ago": calendar days before `now`, in the UI locale. */
export function formatDaysAgo(days: number, locale: string): string {
  return relativeFormatter(locale).format(-Math.max(0, days), 'day');
}

/**
 * How long ago `value` was, in the UI locale and the largest unit that fits:
 * "now", "5 seconds ago", "3 hours ago", "yesterday", "2 weeks ago". Under a day
 * it counts seconds, minutes or hours, each held below the next unit up (59
 * minutes, never "60 minutes"). From a day it counts calendar days, so
 * "yesterday" means the day before today, and weeks, months and years follow
 * from those days. A time after `now` (clock skew) reads as now. Returns '' for
 * missing or invalid input.
 */
export function formatTimeAgo(
  value: string | number | Date | null | undefined,
  locale: string,
  now: number
): string {
  if (value === null || value === undefined || value === '') return '';
  const time = toDate(value).getTime();
  if (Number.isNaN(time)) return '';
  const formatter = relativeFormatter(locale);
  const ago = (amount: number, unit: Intl.RelativeTimeFormatUnit) =>
    formatter.format(amount === 0 ? 0 : -amount, unit);

  const seconds = Math.max(0, (now - time) / 1000);
  if (seconds < 60) return ago(Math.min(59, Math.round(seconds)), 'second');
  if (seconds < 3600) return ago(Math.min(59, Math.max(1, Math.round(seconds / 60))), 'minute');
  if (seconds < 86_400) return ago(Math.min(23, Math.max(1, Math.round(seconds / 3600))), 'hour');

  const days = Math.max(1, calendarDaysBetween(time, now));
  if (days < 7) return ago(days, 'day');
  if (days < 30) return ago(Math.min(4, Math.round(days / 7)), 'week');
  if (days < 365) return ago(Math.min(11, Math.max(1, Math.round(days / 30.44))), 'month');
  return ago(Math.max(1, Math.round(days / 365.25)), 'year');
}
