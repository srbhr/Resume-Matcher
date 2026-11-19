import { describe, expect, it } from 'vitest';
import {
  attachmentSync,
  initialAttachment,
  type AttachmentEvent,
  type AttachmentState,
} from '@/lib/builder/attachment-sync';

/**
 * One builder attachment's save rules, one row per rule. Each comment names the
 * place in components/builder/resume-builder.tsx the rule comes from. The page
 * specs (tests/builder.attachments.test.tsx, tests/builder.agent.test.tsx)
 * prove the component follows these.
 */

const part = (overrides: Partial<AttachmentState> = {}): AttachmentState => ({
  ...initialAttachment,
  ...overrides,
});

/** The server holds SERVER; the editor shows it, at version 3. */
const CLEAN = part({ value: 'SERVER', baseline: 'SERVER', editVersion: 3 });
/** The editor shows an unsaved EDIT at version 4. */
const EDITED = part({ value: 'EDIT', baseline: 'SERVER', editVersion: 4, unsaved: true });

type Row = [string, AttachmentState, AttachmentEvent, AttachmentState];

const rows: Row[] = [
  // loadResumeData
  [
    "a load shows the server's text as saved, without a version bump",
    EDITED,
    { type: 'loaded', content: 'LOADED' },
    part({ value: 'LOADED', baseline: 'LOADED', editVersion: 4 }),
  ],
  // handleCoverLetterChange / handleOutreachChange
  [
    'a change away from the saved text is unsaved',
    CLEAN,
    { type: 'changed', value: 'EDIT' },
    EDITED,
  ],
  [
    'a change back to the saved text is saved again',
    EDITED,
    { type: 'changed', value: 'SERVER' },
    part({ value: 'SERVER', baseline: 'SERVER', editVersion: 5 }),
  ],
  // handleRestoreAttachmentDraft
  [
    'a restored draft that differs is unsaved',
    CLEAN,
    { type: 'draftRestored', value: 'DRAFT' },
    part({ value: 'DRAFT', baseline: 'SERVER', editVersion: 4, unsaved: true }),
  ],
  [
    'a restored draft equal to the saved text still bumps the version',
    CLEAN,
    { type: 'draftRestored', value: 'SERVER' },
    part({ value: 'SERVER', baseline: 'SERVER', editVersion: 4 }),
  ],
  // handleSaveCoverLetter / handleSaveOutreach
  [
    'a save starting counts one more save in flight',
    part({ ...EDITED, savesInFlight: 1 }),
    { type: 'saveStarted' },
    part({ ...EDITED, savesInFlight: 2 }),
  ],
  [
    'a save of the current text and version is saved',
    part({ ...EDITED, savesInFlight: 1 }),
    { type: 'saveSucceeded', content: 'EDIT', version: 4 },
    part({ value: 'EDIT', baseline: 'EDIT', editVersion: 4, savesInFlight: 1 }),
  ],
  [
    'a save overtaken by a different edit moves the baseline and stays unsaved',
    part({ ...EDITED, value: 'LATER', editVersion: 5 }),
    { type: 'saveSucceeded', content: 'EDIT', version: 4 },
    part({ value: 'LATER', baseline: 'EDIT', editVersion: 5, unsaved: true }),
  ],
  [
    'a save overtaken by an edit typed away and back stays unsaved',
    part({ ...EDITED, editVersion: 6 }),
    { type: 'saveSucceeded', content: 'EDIT', version: 4 },
    part({ value: 'EDIT', baseline: 'EDIT', editVersion: 6, unsaved: true }),
  ],
  [
    'the first of two overlapping saves to end leaves one in flight',
    part({ ...CLEAN, savesInFlight: 2 }),
    { type: 'saveSettled' },
    part({ ...CLEAN, savesInFlight: 1 }),
  ],
  ['a save settling never counts below zero', CLEAN, { type: 'saveSettled' }, CLEAN],
  // doGenerateCoverLetter / doGenerateOutreach
  [
    'a generation with no edit since replaces the text as saved',
    CLEAN,
    { type: 'generated', content: 'GENERATED', startVersion: 3 },
    part({ value: 'GENERATED', baseline: 'GENERATED', editVersion: 4 }),
  ],
  [
    'a generation keeps an edit typed while it ran, and the server has the generated text',
    EDITED,
    { type: 'generated', content: 'GENERATED', startVersion: 3 },
    part({ value: 'EDIT', baseline: 'GENERATED', editVersion: 4, unsaved: true }),
  ],
  [
    'a generation keeps an edit that returned to the old text as unsaved',
    part({ ...CLEAN, editVersion: 5 }),
    { type: 'generated', content: 'GENERATED', startVersion: 3 },
    part({ value: 'SERVER', baseline: 'GENERATED', editVersion: 5, unsaved: true }),
  ],
  [
    'a generation that matches an edit typed while it ran is saved',
    EDITED,
    { type: 'generated', content: 'EDIT', startVersion: 3 },
    part({ value: 'EDIT', baseline: 'EDIT', editVersion: 4 }),
  ],
  // applyAgentVersion
  [
    "the agent's text replaces an unsaved edit as saved, at a new version",
    EDITED,
    { type: 'agentApplied', content: 'AGENT' },
    part({ value: 'AGENT', baseline: 'AGENT', editVersion: 5 }),
  ],
];

describe('attachmentSync', () => {
  it.each(rows)('%s', (_name, before, event, after) => {
    // Frozen: the rules return a new state and never change the one they get.
    expect(attachmentSync(Object.freeze(before), event)).toEqual(after);
  });

  it('starts empty, saved, at version 0', () => {
    expect(initialAttachment).toEqual({
      value: '',
      baseline: '',
      editVersion: 0,
      unsaved: false,
      savesInFlight: 0,
    });
  });
});
