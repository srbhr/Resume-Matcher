import { APPLICATION_STATUS_ORDER, type ApplicationStatus } from '@/lib/api/tracker';
import { safeStorage } from '@/lib/utils/resume-draft-storage';

export const TRACKER_HIDDEN_STATUSES_KEY = 'tracker_hidden_statuses';

export function readHiddenStatuses(): Set<ApplicationStatus> {
  // Server render has no localStorage: return the default (everything visible)
  // instead of reaching for storage, matching the house pattern used by the
  // builder's template-settings initialiser.
  if (typeof window === 'undefined') return new Set();

  const raw = safeStorage.get(TRACKER_HIDDEN_STATUSES_KEY);
  if (!raw) return new Set();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    const validStatuses = new Set<ApplicationStatus>(APPLICATION_STATUS_ORDER);
    const hidden = new Set<ApplicationStatus>();
    for (const value of parsed) {
      if (typeof value === 'string' && validStatuses.has(value as ApplicationStatus)) {
        hidden.add(value as ApplicationStatus);
      }
    }
    return hidden;
  } catch {
    return new Set();
  }
}

export function writeHiddenStatuses(hidden: Set<ApplicationStatus>): boolean {
  const ordered = APPLICATION_STATUS_ORDER.filter((status) => hidden.has(status));
  return safeStorage.set(TRACKER_HIDDEN_STATUSES_KEY, JSON.stringify(ordered));
}

/**
 * True when `status` is the only stage still on the board. Hiding it would
 * leave a blank canvas whose only escape hatch is the Manage dialog, so the
 * board keeps at least one column at all times.
 */
export function isLastVisibleStatus(
  hidden: Set<ApplicationStatus>,
  status: ApplicationStatus
): boolean {
  if (hidden.has(status)) return false;
  return APPLICATION_STATUS_ORDER.every(
    (candidate) => candidate === status || hidden.has(candidate)
  );
}

/**
 * Flip one stage's visibility, enforcing the "at least one visible column"
 * invariant. Returns the SAME set instance when the toggle is refused so
 * callers can skip both the re-render and the persist.
 */
export function toggleHiddenStatus(
  hidden: Set<ApplicationStatus>,
  status: ApplicationStatus
): Set<ApplicationStatus> {
  const next = new Set(hidden);
  if (next.delete(status)) return next;
  if (isLastVisibleStatus(hidden, status)) return hidden;
  next.add(status);
  return next;
}
