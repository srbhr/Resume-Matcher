import { apiPost } from '@/lib/api/client';
import type { ProcessedResume } from '@/lib/api/resume';

export type SectionKind = 'work' | 'education' | 'project' | 'skills' | 'summary';

export interface DraftSectionRequest {
  section: SectionKind;
  answers: string;
  name?: string;
  role?: string;
  resume_context?: ProcessedResume | null;
}

export interface CreateResumeResponse {
  message: string;
  request_id: string;
  resume_id: string;
  processing_status: string;
  is_master: boolean;
}

/** Author one resume-section fragment from the user's plain answers. */
export async function draftSection(req: DraftSectionRequest): Promise<Record<string, unknown>> {
  const resp = await apiPost('/resumes/draft-section', req);
  if (!resp.ok) {
    throw new Error(`draft-section failed: ${resp.status}`);
  }
  const body = await resp.json();
  return body.data as Record<string, unknown>;
}

/** Persist the assembled resume (becomes master iff none exists). */
export async function createResumeFromWizard(
  processedData: ProcessedResume,
  title?: string,
): Promise<CreateResumeResponse> {
  const resp = await apiPost('/resumes', { processed_data: processedData, title });
  if (!resp.ok) {
    throw new Error(`create resume failed: ${resp.status}`);
  }
  return (await resp.json()) as CreateResumeResponse;
}
