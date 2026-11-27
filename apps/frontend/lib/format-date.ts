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

/** Each unit and how many of it make the next one up. */
const TIME_AGO_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.348],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

/**
 * How long ago `value` was, in the UI locale and the largest unit that fits:
 * "now", "5 seconds ago", "2 days ago". A time after `now` (clock skew) reads as
 * now. Returns '' for missing or invalid input.
 */
export function formatTimeAgo(
  value: string | number | Date | null | undefined,
  locale: string,
  now: number
): string {
  if (value === null || value === undefined || value === '') return '';
  const time = toDate(value).getTime();
  if (Number.isNaN(time)) return '';
  let formatter = relativeFormatters.get(locale);
  if (!formatter) {
    try {
      formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    } catch {
      formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    }
    relativeFormatters.set(locale, formatter);
  }
  let delta = Math.min(0, (time - now) / 1000);
  for (const [unit, size] of TIME_AGO_UNITS) {
    const rounded = Math.round(delta);
    if (Math.abs(rounded) < size) return formatter.format(rounded === 0 ? 0 : rounded, unit);
    delta /= size;
  }
  return '';
}
