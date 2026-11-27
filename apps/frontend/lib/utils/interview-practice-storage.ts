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

/**
 * A question's key: its group and its text, so a regenerated set starts clean.
 * A question asked again in the same group is told apart by its place among the
 * repeats ("#2"), so each keeps its own mark and note.
 */
export const practiceKey = (group: string, question: string, occurrence = 1) =>
  occurrence > 1 ? `${group}:${question}#${occurrence}` : `${group}:${question}`;

/** The keys for one group's questions, in order. */
export function practiceKeys(group: string, questions: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return questions.map((question) => {
    const occurrence = (seen.get(question) ?? 0) + 1;
    seen.set(question, occurrence);
    return practiceKey(group, question, occurrence);
  });
}

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

/** Saves the marks and notes; false when this browser won't store them. */
export function writeInterviewPractice(resumeId: string, practice: InterviewPractice): boolean {
  return safeStorage.set(keyFor(resumeId), JSON.stringify(practice));
}

export function clearInterviewPractice(resumeId: string): void {
  safeStorage.remove(keyFor(resumeId));
}
