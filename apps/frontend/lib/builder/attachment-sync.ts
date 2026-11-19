/**
 * The save state of one builder attachment (the cover letter or the outreach
 * message), and how each event changes it. Pure: no React, no requests, no
 * storage. Unlike the resume, an attachment has no autosave: it saves on
 * request, and a generation writes to the server too.
 */

export type AttachmentPart = 'coverLetter' | 'outreach';

export interface AttachmentState {
  /** What the editor shows. */
  value: string;
  /** What the server is known to hold. */
  baseline: string;
  /** Bumps on every change the editor did not just read from the server. */
  editVersion: number;
  /**
   * Kept explicit: after a save it also needs the version to match, so an edit
   * typed away and back during the save still counts as unsaved.
   */
  unsaved: boolean;
  /** A count, not a flag: saves can overlap, and the first to end must not clear it. */
  savesInFlight: number;
}

export type AttachmentEvent =
  /** The resume loaded: the server's text is the editor's and the baseline. */
  | { type: 'loaded'; content: string }
  | { type: 'changed'; value: string }
  | { type: 'draftRestored'; value: string }
  | { type: 'saveStarted' }
  /** `content` and `version` are read when the queued write runs, not when Save was pressed. */
  | { type: 'saveSucceeded'; content: string; version: number }
  /** A save ended, whatever the outcome; also when it stopped for an agent conflict. */
  | { type: 'saveSettled' }
  /** The server generated and stored `content`; `startVersion` is the version when it was requested. */
  | { type: 'generated'; content: string; startVersion: number }
  | { type: 'agentApplied'; content: string };

export const initialAttachment: AttachmentState = {
  value: '',
  baseline: '',
  editVersion: 0,
  unsaved: false,
  savesInFlight: 0,
};

export function attachmentSync(state: AttachmentState, event: AttachmentEvent): AttachmentState {
  switch (event.type) {
    case 'loaded':
      return { ...state, value: event.content, baseline: event.content, unsaved: false };
    case 'changed':
    case 'draftRestored':
      return {
        ...state,
        value: event.value,
        editVersion: state.editVersion + 1,
        unsaved: event.value !== state.baseline,
      };
    case 'saveStarted':
      return { ...state, savesInFlight: state.savesInFlight + 1 };
    case 'saveSucceeded':
      return {
        ...state,
        baseline: event.content,
        unsaved: !(event.version === state.editVersion && state.value === event.content),
      };
    case 'saveSettled':
      return { ...state, savesInFlight: Math.max(0, state.savesInFlight - 1) };
    case 'generated': {
      // The server holds the generated text either way; an edit typed while it
      // ran keeps priority in the editor.
      const next =
        event.startVersion === state.editVersion
          ? { ...state, value: event.content, editVersion: state.editVersion + 1 }
          : state;
      return { ...next, baseline: event.content, unsaved: next.value !== event.content };
    }
    case 'agentApplied':
      return {
        ...state,
        value: event.content,
        baseline: event.content,
        editVersion: state.editVersion + 1,
        unsaved: false,
      };
  }
}
