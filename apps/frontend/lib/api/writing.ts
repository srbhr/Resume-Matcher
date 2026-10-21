import { apiPost, DEFAULT_TIMEOUT_MS } from './client';
import type { ResumeData } from '@/components/dashboard/resume-component';

export type WritingRule =
  | 'em_dash'
  | 'weak_opener'
  | 'no_outcome'
  | 'first_person'
  | 'ai_phrase'
  | 'repeated_opener'
  | 'long_bullet'
  | 'no_metric';

/** One problem in one line; `path` is e.g. `workExperience[0].description[2]` or `summary`. */
export interface WritingFinding {
  path: string;
  rule: WritingRule;
  severity: 'hard' | 'soft';
  excerpt: string;
}

export interface CriticNote {
  path: string;
  note: string;
}

/** Writing quality. `score` comes from the code rules only, so it is the same with every AI provider. */
export interface WritingReport {
  score: number | null;
  before_score: number | null;
  findings: WritingFinding[];
  critic_notes: CriticNote[];
  rewritten_paths: string[];
  rejected_rewrites: number;
}

export interface WritingChange {
  path: string;
  before: string;
  after: string;
}

export interface WritingImproveResult {
  improved_data: ResumeData;
  writing: WritingReport;
  changes: WritingChange[];
}

async function readError(res: Response, fallback: string): Promise<Error> {
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
  return new Error(typeof data.detail === 'string' ? data.detail : fallback);
}

/** Scores a resume's writing with the code rules (no AI call). */
export async function checkWriting(resumeData: ResumeData): Promise<WritingReport> {
  const res = await apiPost('/writing/check', { resume_data: resumeData });
  if (!res.ok) throw await readError(res, `Writing check failed (status ${res.status}).`);
  return res.json() as Promise<WritingReport>;
}

/** Critiques the resume and rewrites weak lines without adding facts. Saves nothing. */
export async function improveWriting(
  resumeData: ResumeData,
  progressId?: string
): Promise<WritingImproveResult> {
  const res = await apiPost(
    '/writing/improve',
    { resume_data: resumeData, ...(progressId ? { progress_id: progressId } : {}) },
    DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) throw await readError(res, `Improve writing failed (status ${res.status}).`);
  return res.json() as Promise<WritingImproveResult>;
}
