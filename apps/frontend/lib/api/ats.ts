import { apiPost } from './client';
import { toPageFitSettings } from './resume';
import { type TemplateSettings } from '@/lib/types/template-settings';

export type ParseCheckStatus = 'pass' | 'warn' | 'fail';
export type ParseCheckFieldStatus = 'found' | 'garbled' | 'missing' | 'hidden';

export interface ParseCheck {
  id: string;
  category: 'extraction' | 'layout' | 'content';
  severity: 'high' | 'medium' | 'low';
  status: ParseCheckStatus;
  params: Record<string, unknown>;
}

export interface ParseCheckRoundTrip {
  content_recall: number;
  order_fidelity: number;
  truncated: boolean;
  fields: { field: string; status: ParseCheckFieldStatus; score: number }[];
}

export interface ParseCheckReport {
  schema_version: string;
  source: 'upload' | 'render';
  extractability: 'full' | 'partial' | 'none';
  overall_score: number;
  content_score: number;
  page_count: number | null;
  checks: ParseCheck[];
  roundtrip: ParseCheckRoundTrip | null;
  template: string | null;
  extracted_text_preview: string;
}

/** Parse-checks the exact PDF the download button produces for these settings. */
export async function checkResumeParse(
  resumeId: string,
  settings: TemplateSettings,
  locale?: string
): Promise<ParseCheckReport> {
  const res = await apiPost(
    `/resumes/${encodeURIComponent(resumeId)}/parse-check`,
    toPageFitSettings(settings, locale)
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
    const detail = typeof data.detail === 'string' ? data.detail : null;
    throw new Error(detail || `Parse check failed (status ${res.status}).`);
  }
  return res.json() as Promise<ParseCheckReport>;
}
