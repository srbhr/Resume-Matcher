import { safeStorage } from '@/lib/utils/resume-draft-storage';

/**
 * Interview practice marks and notes, per resume, in this browser only. Settings'
 * "Reset database" clears every key under this prefix.
 */
export const INTERVIEW_PRACTICE_STORAGE_PREFIX = 'resume_interview_practice:';

export interface InterviewPractice {
  /** Questions marked practised, by question key. */
  practised: string[];
  /** A note per question key. */
  notes: Record<string, string>;
}

export const EMPTY_PRACTICE: InterviewPractice = { practised: [], notes: {} };

const keyFor = (resumeId: string) => `${INTERVIEW_PRACTICE_STORAGE_PREFIX}${resumeId}`;

/** A question's key: its group and its text, so a regenerated set starts clean. */
export const practiceKey = (group: string, question: string) => `${group}:${question}`;

export function readInterviewPractice(resumeId: string): InterviewPractice {
  const raw = safeStorage.get(keyFor(resumeId));
  if (!raw) return EMPTY_PRACTICE;
  try {
    const parsed = JSON.parse(raw) as Partial<InterviewPractice>;
    return {
      practised: Array.isArray(parsed.practised)
        ? parsed.practised.filter((k): k is string => typeof k === 'string')
        : [],
      notes:
        parsed.notes && typeof parsed.notes === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.notes).filter(([, v]) => typeof v === 'string')
            )
          : {},
    };
  } catch {
    return EMPTY_PRACTICE;
  }
}

export function writeInterviewPractice(resumeId: string, practice: InterviewPractice): void {
  safeStorage.set(keyFor(resumeId), JSON.stringify(practice));
}

export function clearInterviewPractice(resumeId: string): void {
  safeStorage.remove(keyFor(resumeId));
}
