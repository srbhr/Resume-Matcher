import type { Application } from '@/lib/api/tracker';

/** An Applied card with no reply for this many days is due a follow-up. */
export const FOLLOW_UP_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `appliedAt` to `now`, or null when the date is missing or unreadable. */
export function daysSinceApplied(appliedAt: string | null, now: Date): number | null {
  if (!appliedAt) return null;
  const applied = Date.parse(appliedAt);
  if (Number.isNaN(applied)) return null;
  return Math.max(0, Math.floor((now.getTime() - applied) / DAY_MS));
}

/** True for a card still in Applied whose applied date is at least a week old. */
export function isFollowUpDue(
  application: Pick<Application, 'status' | 'applied_at'>,
  now: Date
): boolean {
  if (application.status !== 'applied') return false;
  const days = daysSinceApplied(application.applied_at, now);
  return days !== null && days >= FOLLOW_UP_AFTER_DAYS;
}
