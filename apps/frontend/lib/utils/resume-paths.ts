import type { ResumeData } from '@/components/dashboard/resume-component';

/** A resume line path from the backend: `summary`, a bullet, or the skills list. */
const BULLET_PATH = /^(workExperience|personalProjects)\[(\d+)\]\.description\[(\d+)\]$/;

export const SKILLS_PATH = 'additional.technicalSkills';

export type ResumeLocation =
  | { kind: 'summary' }
  | { kind: 'skills' }
  | { kind: 'bullet'; entry: string; line: number }
  | { kind: 'unknown' };

/** Where a backend path points, in words the UI can show. */
export function locatePath(resume: ResumeData | null | undefined, path: string): ResumeLocation {
  if (path === 'summary') return { kind: 'summary' };
  if (path === SKILLS_PATH) return { kind: 'skills' };
  const match = BULLET_PATH.exec(path);
  if (!match) return { kind: 'unknown' };
  const [, section, entryIndex, lineIndex] = match;
  const index = Number(entryIndex);
  const work = resume?.workExperience?.[index];
  const name =
    section === 'workExperience'
      ? work?.company || work?.title
      : resume?.personalProjects?.[index]?.name;
  return { kind: 'bullet', entry: name || '', line: Number(lineIndex) + 1 };
}

/** The text at a summary or bullet path, if the resume has it. */
export function lineAt(resume: ResumeData | null | undefined, path: string): string | undefined {
  if (!resume) return undefined;
  if (path === 'summary') return resume.summary || undefined;
  const match = BULLET_PATH.exec(path);
  if (!match) return undefined;
  const [, section, entryIndex, lineIndex] = match;
  const entries = section === 'workExperience' ? resume.workExperience : resume.personalProjects;
  return entries?.[Number(entryIndex)]?.description?.[Number(lineIndex)];
}

/** Splits `text` into plain and matched parts for each case-insensitive, whole-term keyword. */
export function splitByKeywords(
  text: string,
  keywords: string[]
): { text: string; match: boolean }[] {
  const terms = keywords.map((k) => k.trim()).filter(Boolean);
  if (!terms.length || !text) return [{ text, match: false }];
  const escaped = terms
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const parts: { text: string; match: boolean }[] = [];
  let last = 0;
  for (const found of text.matchAll(pattern)) {
    const start = found.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: found[0], match: true });
    last = start + found[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts.length ? parts : [{ text, match: false }];
}
