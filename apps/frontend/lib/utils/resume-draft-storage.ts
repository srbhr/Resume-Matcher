import type { ResumeData } from '@/components/dashboard/resume-component';

export const LEGACY_RESUME_DRAFT_STORAGE_KEY = 'resume_builder_draft';
export const RESUME_DRAFT_STORAGE_PREFIX = `${LEGACY_RESUME_DRAFT_STORAGE_KEY}:`;
const NEW_RESUME_DRAFT_ID = 'new';

/**
 * How long a local draft stays eligible for recovery. Beyond this the user has
 * almost certainly moved on, and offering it risks resurrecting stale content
 * over a server copy that has since changed elsewhere.
 */
export const RESUME_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Tolerated clock skew for a draft stamped in the future. Beyond this the
 * timestamp is treated as untrustworthy rather than as "very fresh".
 */
export const RESUME_DRAFT_MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000; // 1 day

export interface ResumeDraftEnvelope {
  resumeId: string | null;
  updatedAt: number;
  data: ResumeData;
}

interface ParseResumeDraftOptions {
  allowLegacyPlainData?: boolean;
  /**
   * Reference timestamp for the expiry check. Defaults to `Date.now()`.
   *
   * Deliberately separate from `fallbackUpdatedAt`, which means "the timestamp
   * to stamp on a legacy plain draft that carries none" — a different concept.
   * Overloading that one would conflate "when was this written" with "what is
   * now", and silently change legacy-draft behaviour.
   */
  now?: number;
}

export function getResumeDraftStorageKey(resumeId: string | null | undefined): string {
  return `${RESUME_DRAFT_STORAGE_PREFIX}${resumeId || NEW_RESUME_DRAFT_ID}`;
}

export function buildResumeDraft(
  resumeId: string | null | undefined,
  data: ResumeData,
  updatedAt = Date.now()
): ResumeDraftEnvelope {
  return {
    resumeId: resumeId || null,
    updatedAt,
    data,
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return !Array.isArray(value);
}

function isResumeDataShape(value: unknown): value is ResumeData {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    isObjectRecord(value.personalInfo) &&
    Array.isArray(value.workExperience) &&
    Array.isArray(value.education) &&
    Array.isArray(value.personalProjects) &&
    isObjectRecord(value.additional)
  );
}

function isResumeDraftEnvelope(value: unknown): value is ResumeDraftEnvelope {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    'data' in value &&
    'updatedAt' in value &&
    // Number.isFinite, not `typeof === 'number'`: NaN and ±Infinity pass the
    // typeof check, and NaN then defeats BOTH expiry comparisons (every
    // comparison against NaN is false), so a malformed draft would be treated
    // as permanently fresh.
    Number.isFinite(value.updatedAt) &&
    isResumeDataShape(value.data)
  );
}

export function parseResumeDraft(
  rawDraft: string | null,
  resumeId: string | null | undefined,
  fallbackUpdatedAt = Date.now(),
  options: ParseResumeDraftOptions = {}
): ResumeDraftEnvelope | null {
  if (!rawDraft) return null;

  try {
    const parsed = JSON.parse(rawDraft) as unknown;
    if (isResumeDraftEnvelope(parsed)) {
      if ((parsed.resumeId || null) !== (resumeId || null)) {
        return null;
      }

      // T-04: `updatedAt` was written and validated but never read, so a draft
      // from a one-off tailor session survived forever and would be offered as
      // "unsaved work" months later. Expire it instead.
      const now = options.now ?? Date.now();
      const age = now - parsed.updatedAt;
      // Negative age means the draft is stamped in the future — a client clock
      // that was ahead when it was written. Left unchecked it stays recoverable
      // until that future date plus the max age. Allow a small skew window and
      // reject anything beyond it.
      if (age > RESUME_DRAFT_MAX_AGE_MS || age < -RESUME_DRAFT_MAX_CLOCK_SKEW_MS) {
        return null;
      }

      return parsed;
    }

    if (options.allowLegacyPlainData === false || !isResumeDataShape(parsed)) {
      return null;
    }

    return buildResumeDraft(resumeId, parsed as ResumeData, fallbackUpdatedAt);
  } catch {
    return null;
  }
}

/**
 * Structural deep-equality, insensitive to object key order.
 *
 * This gates a data-loss decision (whether to offer the "Restore Local Draft?"
 * dialog), so it must not report a difference that isn't one. `JSON.stringify`
 * equality is key-order sensitive: a client-authored draft and a
 * Pydantic-serialised server response can carry identical data with different
 * key order and compare unequal, surfacing a recovery prompt whose two options
 * are indistinguishable. Arrays stay order-sensitive — order is meaningful for
 * description rows and their parallel styles.
 */
const deepEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }

  if (typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        deepEqual(leftRecord[key], rightRecord[key])
    );
  }

  // NaN !== NaN, but two NaNs are not a meaningful "unsaved change".
  return Number.isNaN(left) && Number.isNaN(right);
};

export function isSameResumeData(left: ResumeData, right: ResumeData): boolean {
  return deepEqual(left, right);
}

export function shouldPromptForDraftRestore(
  draft: ResumeDraftEnvelope | null,
  serverData: ResumeData
): boolean {
  return Boolean(draft && !isSameResumeData(draft.data, serverData));
}

/**
 * localStorage wrapper that never throws (H-08).
 *
 * `localStorage` raises `SecurityError` when storage is blocked (enterprise
 * policy, some embedded/iframe contexts) and `QuotaExceededError` on write.
 * Unguarded access in the builder meant a blocked-storage user got a blank
 * editor (throw during an effect -> error boundary), a resume that never
 * loaded (rejected promise inside the loader, no error UI), or a silently
 * dropped keystroke.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable — nothing to clean up */
    }
  },
  /** True when storage is readable and writable in this context. */
  isAvailable(): boolean {
    try {
      const probe = '__rm_storage_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  },
};
