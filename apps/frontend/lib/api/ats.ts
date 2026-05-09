/**
 * ATS screening API client and TypeScript types.
 */

import { apiPost } from './client';
import type { ResumeData } from '@/components/dashboard/resume-component';

export interface ScoreBreakdown {
  skills_match: number;
  experience_match: number;
  domain_match: number;
  tools_match: number;
  achievement_match: number;
  total: number;
}

export interface KeywordRow {
  keyword: string;
  found_in_resume: boolean;
  section: string | null;
}

export type ATSDecision = 'PASS' | 'BORDERLINE' | 'REJECT';

export interface ATSScreeningResult {
  score: ScoreBreakdown;
  decision: ATSDecision;
  keyword_table: KeywordRow[];
  missing_keywords: string[];
  warning_flags: string[];
  optimization_suggestions: string[];
  optimized_resume: ResumeData | null;
  saved_resume_id: string | null;
}

export interface ATSScreenRequest {
  resume_id?: string;
  resume_text?: string;
  job_id?: string;
  job_description?: string;
  save_optimized?: boolean;
}

export async function screenResume(
  request: ATSScreenRequest
): Promise<ATSScreeningResult> {
  const resp = await apiPost('/ats/screen', request, 120_000);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: 'ATS screening failed' }));
    throw new Error(err.detail ?? 'ATS screening failed');
  }
  return resp.json();
}

export interface ATSSaveResumeRequest {
  resume_data: ResumeData;
  parent_id?: string | null;
  title?: string;
}

export interface ATSSaveResumeResponse {
  resume_id: string;
}

export async function saveAtsResume(
  request: ATSSaveResumeRequest
): Promise<ATSSaveResumeResponse> {
  const resp = await apiPost('/ats/save-resume', request, 30_000);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: 'Save failed' }));
    throw new Error(err.detail ?? 'Save failed');
  }
  return resp.json();
}
