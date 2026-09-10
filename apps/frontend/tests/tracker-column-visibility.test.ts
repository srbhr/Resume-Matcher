import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APPLICATION_STATUS_ORDER, type ApplicationStatus } from '@/lib/api/tracker';
import {
  isLastVisibleStatus,
  readHiddenStatuses,
  toggleHiddenStatus,
  TRACKER_HIDDEN_STATUSES_KEY,
  writeHiddenStatuses,
} from '@/lib/utils/tracker-column-visibility';

const ALL_BUT_SAVED = APPLICATION_STATUS_ORDER.filter((status) => status !== 'saved');

describe('tracker column visibility storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to all statuses visible', () => {
    expect(readHiddenStatuses().size).toBe(0);
  });

  it('persists and reloads hidden statuses', () => {
    const hidden = new Set<ApplicationStatus>(['interview', 'rejected']);

    expect(writeHiddenStatuses(hidden)).toBe(true);

    const loaded = readHiddenStatuses();
    expect(loaded.has('interview')).toBe(true);
    expect(loaded.has('rejected')).toBe(true);
    expect(loaded.has('applied')).toBe(false);
  });

  it('ignores corrupt JSON', () => {
    localStorage.setItem(TRACKER_HIDDEN_STATUSES_KEY, '{broken');
    expect(readHiddenStatuses().size).toBe(0);
  });

  it('ignores unknown statuses', () => {
    localStorage.setItem(TRACKER_HIDDEN_STATUSES_KEY, JSON.stringify(['interview', 'unknown']));
    expect(Array.from(readHiddenStatuses())).toEqual(['interview']);
  });

  it('ignores non-array payloads', () => {
    localStorage.setItem(TRACKER_HIDDEN_STATUSES_KEY, JSON.stringify({ saved: true }));
    expect(readHiddenStatuses().size).toBe(0);
  });

  it('writes statuses in the canonical order', () => {
    writeHiddenStatuses(new Set<ApplicationStatus>(['rejected', 'saved']));
    expect(JSON.parse(localStorage.getItem(TRACKER_HIDDEN_STATUSES_KEY) ?? '[]')).toEqual([
      APPLICATION_STATUS_ORDER[0],
      APPLICATION_STATUS_ORDER[APPLICATION_STATUS_ORDER.length - 1],
    ]);
  });

  it('returns an empty set when there is no window (server render)', () => {
    // Stored preferences exist, so an unguarded read would return them and this
    // assertion would fail — storage must not be touched without a window.
    localStorage.setItem(TRACKER_HIDDEN_STATUSES_KEY, JSON.stringify(['interview', 'rejected']));
    vi.stubGlobal('window', undefined);

    expect(typeof window).toBe('undefined');
    expect(readHiddenStatuses().size).toBe(0);
  });
});

describe('isLastVisibleStatus', () => {
  it('is false while another stage is still visible', () => {
    const hidden = new Set<ApplicationStatus>(ALL_BUT_SAVED.slice(1));
    expect(isLastVisibleStatus(hidden, 'saved')).toBe(false);
  });

  it('is true for the only stage left on the board', () => {
    const hidden = new Set<ApplicationStatus>(ALL_BUT_SAVED);
    expect(isLastVisibleStatus(hidden, 'saved')).toBe(true);
  });

  it('is false for an already-hidden stage', () => {
    const hidden = new Set<ApplicationStatus>(ALL_BUT_SAVED);
    expect(isLastVisibleStatus(hidden, 'applied')).toBe(false);
  });
});

describe('toggleHiddenStatus', () => {
  it('hides a visible stage', () => {
    const next = toggleHiddenStatus(new Set<ApplicationStatus>(), 'interview');
    expect(Array.from(next)).toEqual(['interview']);
  });

  it('re-shows a hidden stage', () => {
    const next = toggleHiddenStatus(new Set<ApplicationStatus>(['interview']), 'interview');
    expect(next.size).toBe(0);
  });

  it('re-shows a hidden stage even when it is the only visible one that would remain', () => {
    // Unhiding is never blocked: only hiding the last visible stage is.
    const next = toggleHiddenStatus(
      new Set<ApplicationStatus>(APPLICATION_STATUS_ORDER),
      'applied'
    );
    expect(next.has('applied')).toBe(false);
  });

  it('refuses to hide the last visible stage', () => {
    const hidden = new Set<ApplicationStatus>(ALL_BUT_SAVED);
    const next = toggleHiddenStatus(hidden, 'saved');

    // Same instance signals "refused" so callers skip the re-render and persist.
    expect(next).toBe(hidden);
    expect(next.has('saved')).toBe(false);
    expect(APPLICATION_STATUS_ORDER.filter((status) => !next.has(status))).toEqual(['saved']);
  });

  it('never leaves the board without a column', () => {
    let hidden = new Set<ApplicationStatus>();
    for (const status of APPLICATION_STATUS_ORDER) {
      hidden = toggleHiddenStatus(hidden, status);
    }
    expect(APPLICATION_STATUS_ORDER.filter((status) => !hidden.has(status)).length).toBe(1);
  });

  it('does not mutate the set it is given', () => {
    const hidden = new Set<ApplicationStatus>(['interview']);
    toggleHiddenStatus(hidden, 'applied');
    expect(Array.from(hidden)).toEqual(['interview']);
  });
});
