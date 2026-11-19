import { describe, expect, it } from 'vitest';
import {
  initialResumeSync,
  resumeSync,
  type ResumeSyncEvent,
  type ResumeSyncState,
} from '@/lib/builder/resume-sync';

/**
 * The builder's resume save rules, one row per rule. Each comment names the
 * place in components/builder/resume-builder.tsx the rule comes from. The page
 * specs (tests/builder.*.test.tsx) prove the component follows these.
 */

const NOW = 1_000;

const state = (overrides: Partial<ResumeSyncState> = {}): ResumeSyncState =>
  Object.freeze({ ...initialResumeSync, load: 'loaded', ...overrides });

/** A loaded resume with an unsaved edit at version 3; the server holds version 2. */
const DIRTY = state({ dirty: true, editVersion: 3, syncedVersion: 2, unsyncedSince: 500 });
/** A loaded resume the server holds at version 3. */
const CLEAN = state({ editVersion: 3, syncedVersion: 3 });

type Row = [string, ResumeSyncState, ResumeSyncEvent, ResumeSyncState];

const rows: Row[] = [
  // loadResumeData
  [
    'a load that starts only flips the load state',
    DIRTY,
    { type: 'loadStarted' },
    { ...DIRTY, load: 'loading' },
  ],
  [
    'a failed load keeps edits unsaved',
    { ...DIRTY, load: 'loading' },
    { type: 'loadFailed' },
    { ...DIRTY, load: 'failed' },
  ],
  [
    "the server copy becomes the baseline when it's read",
    state({ ...DIRTY, load: 'loading', saveFailed: true }),
    { type: 'loadedFromServer' },
    state({ editVersion: 3, syncedVersion: 3 }),
  ],
  [
    'a resume opened from the tailor flow, a draft or blank sets no baseline',
    state({ ...DIRTY, load: 'loading' }),
    { type: 'loadedLocally' },
    DIRTY,
  ],
  // handleUpdate
  [
    'an edit bumps the version, dirties, starts the unsaved run and clears a failed save',
    state({ ...CLEAN, saveFailed: true }),
    { type: 'edited', now: NOW },
    state({ dirty: true, editVersion: 4, syncedVersion: 3, unsyncedSince: NOW }),
  ],
  [
    'a further edit keeps the start of the unsaved run',
    DIRTY,
    { type: 'edited', now: NOW },
    { ...DIRTY, editVersion: 4 },
  ],
  // the autosave effect
  [
    'every autosave attempt restarts the unsaved run (H-01)',
    DIRTY,
    { type: 'autoSaveStarted', now: NOW },
    { ...DIRTY, autoSaving: true, unsyncedSince: NOW },
  ],
  [
    'an autosave of the latest version syncs it',
    state({ ...DIRTY, autoSaving: true, saveFailed: true }),
    { type: 'autoSaveSucceeded', version: 3 },
    state({ editVersion: 3, syncedVersion: 3, autoSaving: true }),
  ],
  [
    'an autosave overtaken by an edit leaves the resume dirty and the synced version alone',
    state({ ...DIRTY, autoSaving: true, saveFailed: true }),
    { type: 'autoSaveSucceeded', version: 2 },
    { ...DIRTY, autoSaving: true },
  ],
  // flushResumeChanges
  [
    'a manual save starting changes nothing else, not even the unsaved run',
    DIRTY,
    { type: 'manualSaveStarted' },
    { ...DIRTY, manualSaving: true },
  ],
  [
    'a manual save of the latest version syncs it',
    state({ ...DIRTY, manualSaving: true, saveFailed: true }),
    { type: 'manualSaveSucceeded', version: 3 },
    state({ editVersion: 3, syncedVersion: 3, manualSaving: true }),
  ],
  [
    'a manual save overtaken by an edit records its version but stays dirty',
    state({ ...DIRTY, editVersion: 5, manualSaving: true }),
    { type: 'manualSaveSucceeded', version: 4 },
    state({ ...DIRTY, editVersion: 5, syncedVersion: 4, manualSaving: true }),
  ],
  [
    'a manual save that lands after a newer autosave keeps the newer version, and is clean',
    state({ editVersion: 3, syncedVersion: 3, manualSaving: true }),
    { type: 'manualSaveSucceeded', version: 2 },
    state({ editVersion: 3, syncedVersion: 3, manualSaving: true }),
  ],
  [
    'a failed save leaves the resume dirty',
    state({ ...DIRTY, autoSaving: true }),
    { type: 'saveFailed' },
    state({ ...DIRTY, autoSaving: true, saveFailed: true }),
  ],
  [
    'an autosave settling clears only its own flag',
    state({ ...DIRTY, autoSaving: true, manualSaving: true }),
    { type: 'saveSettled', kind: 'auto' },
    { ...DIRTY, manualSaving: true },
  ],
  [
    'a manual save settling clears only its own flag',
    state({ ...DIRTY, autoSaving: true, manualSaving: true }),
    { type: 'saveSettled', kind: 'manual' },
    { ...DIRTY, autoSaving: true },
  ],
  // handleReset
  [
    'a reset with no save in flight is clean at a new version',
    state({ ...DIRTY, saveFailed: true }),
    { type: 'reset', now: NOW },
    state({ editVersion: 4, syncedVersion: 4 }),
  ],
  [
    'a reset during an autosave stays dirty, so autosave sends the reset state',
    state({ ...DIRTY, autoSaving: true, saveFailed: true }),
    { type: 'reset', now: NOW },
    state({ ...DIRTY, editVersion: 4, unsyncedSince: NOW, autoSaving: true }),
  ],
  [
    'a reset during a manual save stays dirty too',
    state({ ...CLEAN, manualSaving: true }),
    { type: 'reset', now: NOW },
    state({ ...CLEAN, dirty: true, editVersion: 4, unsyncedSince: NOW, manualSaving: true }),
  ],
  // handleRestoreLocalDraft
  [
    'a restored draft is an unsaved edit with a fresh unsaved run',
    state({ ...DIRTY, saveFailed: true }),
    { type: 'draftRestored', now: NOW },
    { ...DIRTY, editVersion: 4, unsyncedSince: NOW },
  ],
  // regenerateWizard onSuccess
  [
    'a regenerated resume is clean without a version bump, and keeps a failed save',
    state({ ...DIRTY, saveFailed: true }),
    { type: 'regenerated' },
    state({ editVersion: 3, syncedVersion: 3, saveFailed: true }),
  ],
  // applyAgentVersion
  [
    "the agent's resume replaces unsaved edits: clean at a new version",
    state({ ...DIRTY, saveFailed: true }),
    { type: 'agentApplied', resume: true },
    state({ editVersion: 4, syncedVersion: 4 }),
  ],
  [
    'an agent update to an attachment only bumps the version of a clean resume',
    CLEAN,
    { type: 'agentApplied', resume: false },
    { ...CLEAN, editVersion: 4 },
  ],
  [
    'an agent update to an attachment only keeps the unsaved resume edits',
    state({ ...DIRTY, saveFailed: true }),
    { type: 'agentApplied', resume: false },
    state({ ...DIRTY, editVersion: 4, saveFailed: true }),
  ],
];

describe('resumeSync', () => {
  it.each(rows)('%s', (_name, before, event, after) => {
    // Frozen: the rules return a new state and never change the one they get.
    expect(resumeSync(Object.freeze(before), event)).toEqual(after);
  });

  it('starts loading, clean, at version 0', () => {
    expect(initialResumeSync).toEqual({
      load: 'loading',
      dirty: false,
      editVersion: 0,
      syncedVersion: 0,
      unsyncedSince: null,
      autoSaving: false,
      manualSaving: false,
      saveFailed: false,
    });
  });
});
