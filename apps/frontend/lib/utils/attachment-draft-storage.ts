import {
  RESUME_DRAFT_MAX_AGE_MS,
  RESUME_DRAFT_MAX_CLOCK_SKEW_MS,
  safeStorage,
} from '@/lib/utils/resume-draft-storage';

export const ATTACHMENT_DRAFT_STORAGE_PREFIX = 'resume_builder_attachment_draft:';

export interface AttachmentDraftEnvelope {
  resumeId: string;
  updatedAt: number;
  coverLetter: string;
  outreachMessage: string;
}

export function getAttachmentDraftStorageKey(resumeId: string): string {
  return `${ATTACHMENT_DRAFT_STORAGE_PREFIX}${resumeId}`;
}

export function readAttachmentDraft(
  resumeId: string,
  now = Date.now()
): AttachmentDraftEnvelope | null {
  const rawDraft = safeStorage.get(getAttachmentDraftStorageKey(resumeId));
  if (!rawDraft) return null;

  try {
    const parsed = JSON.parse(rawDraft) as Partial<AttachmentDraftEnvelope>;
    const age = now - Number(parsed.updatedAt);
    if (
      parsed.resumeId !== resumeId ||
      typeof parsed.coverLetter !== 'string' ||
      typeof parsed.outreachMessage !== 'string' ||
      !Number.isFinite(parsed.updatedAt) ||
      age > RESUME_DRAFT_MAX_AGE_MS ||
      age < -RESUME_DRAFT_MAX_CLOCK_SKEW_MS
    ) {
      return null;
    }
    return parsed as AttachmentDraftEnvelope;
  } catch {
    return null;
  }
}

export function writeAttachmentDraft(
  resumeId: string,
  coverLetter: string,
  outreachMessage: string
): boolean {
  return safeStorage.set(
    getAttachmentDraftStorageKey(resumeId),
    JSON.stringify({ resumeId, updatedAt: Date.now(), coverLetter, outreachMessage })
  );
}

export function clearAttachmentDraft(resumeId: string): void {
  safeStorage.remove(getAttachmentDraftStorageKey(resumeId));
}
