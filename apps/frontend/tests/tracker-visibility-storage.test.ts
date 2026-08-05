import { beforeEach, describe, expect, it } from 'vitest';
import {
  TRACKER_VISIBILITY_STORAGE_KEY,
  loadTrackerHiddenStatuses,
  saveTrackerHiddenStatuses,
} from '@/lib/utils/tracker-visibility-storage';

describe('tracker visibility storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to showing every status when no preference exists', () => {
    expect(loadTrackerHiddenStatuses()).toEqual([]);
  });

  it('round-trips hidden statuses in canonical order without duplicates', () => {
    expect(saveTrackerHiddenStatuses(['rejected', 'saved', 'rejected'])).toBe(true);

    expect(loadTrackerHiddenStatuses()).toEqual(['saved', 'rejected']);
    expect(JSON.parse(localStorage.getItem(TRACKER_VISIBILITY_STORAGE_KEY) ?? '')).toEqual({
      version: 1,
      hiddenStatuses: ['saved', 'rejected'],
    });
  });

  it.each([
    'not-json',
    JSON.stringify({ version: 2, hiddenStatuses: ['saved'] }),
    JSON.stringify({ version: 1, hiddenStatuses: 'saved' }),
  ])('falls back to showing every status for an invalid preference', (stored) => {
    localStorage.setItem(TRACKER_VISIBILITY_STORAGE_KEY, stored);

    expect(loadTrackerHiddenStatuses()).toEqual([]);
  });

  it('ignores unknown statuses instead of hiding a real column', () => {
    localStorage.setItem(
      TRACKER_VISIBILITY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        hiddenStatuses: ['future_status', 'interview'],
      })
    );

    expect(loadTrackerHiddenStatuses()).toEqual(['interview']);
  });

  it('does not throw when browser storage is unavailable', () => {
    const blockedStorage = {
      getItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    };

    expect(loadTrackerHiddenStatuses(blockedStorage)).toEqual([]);
    expect(saveTrackerHiddenStatuses(['saved'], blockedStorage)).toBe(false);
  });
});
