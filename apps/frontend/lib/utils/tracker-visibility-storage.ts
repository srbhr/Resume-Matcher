import { APPLICATION_STATUS_ORDER, type ApplicationStatus } from '@/lib/api/tracker';

export const TRACKER_VISIBILITY_STORAGE_KEY = 'resume_matcher.tracker.visibility.v1';

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface WritableStorage {
  setItem(key: string, value: string): void;
}

interface TrackerVisibilityPreference {
  version: 1;
  hiddenStatuses: ApplicationStatus[];
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeHiddenStatuses(statuses: unknown[]): ApplicationStatus[] {
  const requested = new Set(
    statuses.filter((status): status is string => typeof status === 'string')
  );
  return APPLICATION_STATUS_ORDER.filter((status) => requested.has(status));
}

export function loadTrackerHiddenStatuses(
  storage: ReadableStorage | null = browserStorage()
): ApplicationStatus[] {
  if (!storage) return [];

  try {
    const raw = storage.getItem(TRACKER_VISIBILITY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Partial<TrackerVisibilityPreference>;
    if (parsed.version !== 1 || !Array.isArray(parsed.hiddenStatuses)) return [];

    return normalizeHiddenStatuses(parsed.hiddenStatuses);
  } catch {
    return [];
  }
}

export function saveTrackerHiddenStatuses(
  hiddenStatuses: readonly ApplicationStatus[],
  storage: WritableStorage | null = browserStorage()
): boolean {
  if (!storage) return false;

  const preference: TrackerVisibilityPreference = {
    version: 1,
    hiddenStatuses: normalizeHiddenStatuses([...hiddenStatuses]),
  };

  try {
    storage.setItem(TRACKER_VISIBILITY_STORAGE_KEY, JSON.stringify(preference));
    return true;
  } catch {
    return false;
  }
}
