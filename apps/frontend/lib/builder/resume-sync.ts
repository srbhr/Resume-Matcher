/**
 * The builder's resume save state, and how each event changes it. Pure: no
 * React, no requests, no storage. The component keeps the side effects (drafts,
 * timestamps, notifications) and decides them from the state this returns.
 */

export interface ResumeSyncState {
  load: 'loading' | 'loaded' | 'failed';
  /** Kept explicit: an agent update to another part bumps `editVersion` without dirtying the resume. */
  dirty: boolean;
  /**
   * Bumps on every content change, and when the agent applies any part, so an
   * agent check that started earlier can tell. Never reset: two saves can be in
   * flight (a manual save queued behind an autosave), and resetting it on
   * whichever finished first made the other's successful save look failed.
   */
  editVersion: number;
  /** The highest edit version the server is known to hold. */
  syncedVersion: number;
  /** When the current run of unsaved edits started; autosave shortens its wait as it ages. */
  unsyncedSince: number | null;
  /** Both can be true: a manual save does not wait for an autosave in flight. */
  autoSaving: boolean;
  manualSaving: boolean;
  saveFailed: boolean;
}

export type ResumeSyncEvent =
  | { type: 'loadStarted' }
  | { type: 'loadFailed' }
  /** The server copy was read: it is the baseline. */
  | { type: 'loadedFromServer' }
  /** Opened from the tailor flow, a draft offer or the blank resume: no server baseline. */
  | { type: 'loadedLocally' }
  | { type: 'edited'; now: number }
  | { type: 'autoSaveStarted'; now: number }
  /** `version` is the edit version captured when the autosave was scheduled. */
  | { type: 'autoSaveSucceeded'; version: number }
  | { type: 'manualSaveStarted' }
  /** `version` is the edit version captured when the manual save started. */
  | { type: 'manualSaveSucceeded'; version: number }
  | { type: 'saveFailed' }
  /** A save ended, whatever the outcome; also when it stopped for an agent conflict. */
  | { type: 'saveSettled'; kind: 'auto' | 'manual' }
  | { type: 'reset'; now: number }
  | { type: 'draftRestored'; now: number }
  /** The regenerate wizard applied its changes and the resume was read again. */
  | { type: 'regenerated' }
  /** The agent's version was applied; `resume` says whether the resume part was among its changes. */
  | { type: 'agentApplied'; resume: boolean };

export const initialResumeSync: ResumeSyncState = {
  load: 'loading',
  dirty: false,
  editVersion: 0,
  syncedVersion: 0,
  unsyncedSince: null,
  autoSaving: false,
  manualSaving: false,
  saveFailed: false,
};

/** Clean, with the server holding the current version. */
const synced = (state: ResumeSyncState): ResumeSyncState => ({
  ...state,
  dirty: false,
  syncedVersion: state.editVersion,
  unsyncedSince: null,
});

export function resumeSync(state: ResumeSyncState, event: ResumeSyncEvent): ResumeSyncState {
  switch (event.type) {
    case 'loadStarted':
      return { ...state, load: 'loading' };
    case 'loadFailed':
      // Edits and drafts stay: nothing is known about the server copy.
      return { ...state, load: 'failed' };
    case 'loadedFromServer':
      return { ...synced(state), load: 'loaded', saveFailed: false };
    case 'loadedLocally':
      return { ...state, load: 'loaded' };
    case 'edited':
      return {
        ...state,
        editVersion: state.editVersion + 1,
        dirty: true,
        unsyncedSince: state.unsyncedSince ?? event.now,
        saveFailed: false,
      };
    case 'autoSaveStarted':
      // Every attempt restarts the window. Restarting only when the save then
      // matched left one mid-flight edit pinning the delay to its floor (H-01).
      return { ...state, autoSaving: true, unsyncedSince: event.now };
    case 'autoSaveSucceeded':
      if (state.editVersion !== event.version) return { ...state, saveFailed: false };
      return { ...synced(state), saveFailed: false };
    case 'manualSaveStarted':
      return { ...state, manualSaving: true };
    case 'manualSaveSucceeded': {
      // An autosave can settle ahead of this queued save: take the higher version.
      const next = {
        ...state,
        syncedVersion: Math.max(state.syncedVersion, event.version),
        saveFailed: false,
      };
      return next.editVersion === next.syncedVersion ? synced(next) : next;
    }
    case 'saveFailed':
      return { ...state, saveFailed: true };
    case 'saveSettled':
      return event.kind === 'auto'
        ? { ...state, autoSaving: false }
        : { ...state, manualSaving: false };
    case 'reset': {
      // The bump stops a save in flight from claiming the reset state as synced.
      const next = { ...state, editVersion: state.editVersion + 1, saveFailed: false };
      // That save carries the discarded edits, so the server is about to hold
      // what the editor no longer shows: stay dirty and let autosave converge.
      if (state.autoSaving || state.manualSaving) {
        return { ...next, dirty: true, unsyncedSince: event.now };
      }
      return synced(next);
    }
    case 'draftRestored':
      return {
        ...state,
        editVersion: state.editVersion + 1,
        dirty: true,
        unsyncedSince: event.now,
        saveFailed: false,
      };
    case 'regenerated':
      return synced(state);
    case 'agentApplied': {
      // The bump stops an agent check that started earlier from reopening the banner.
      const next = { ...state, editVersion: state.editVersion + 1 };
      return event.resume ? { ...synced(next), saveFailed: false } : next;
    }
  }
}
