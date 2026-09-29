import type {
  ImprovedResult,
  InterviewPrepData,
} from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { type TemplateSettings } from '@/lib/types/template-settings';
import { type Locale } from '@/i18n/config';
import { clearResumeWizardCompletion } from '@/lib/utils/resume-wizard-storage';
import {
  API_BASE,
  DEFAULT_TIMEOUT_MS,
  apiPost,
  apiPatch,
  apiDelete,
  apiFetch,
  parseErrorDetail,
} from './client';

// Matches backend schemas/models.py ResumeData
interface ProcessedResume {
  personalInfo?: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    website?: string | null;
    linkedin?: string | null;
    github?: string | null;
  };
  summary?: string;
  workExperience?: Array<{
    id: number;
    title?: string;
    company?: string;
    location?: string | null;
    years?: string;
    description?: string[];
    descriptionStyles?: ('bullet' | 'plain')[];
  }>;
  education?: Array<{
    id: number;
    institution?: string;
    degree?: string;
    years?: string;
    description?: string | null;
  }>;
  personalProjects?: Array<{
    id: number;
    name?: string;
    role?: string;
    years?: string;
    github?: string | null;
    website?: string | null;
    description?: string[];
    descriptionStyles?: ('bullet' | 'plain')[];
  }>;
  additional?: {
    technicalSkills?: string[];
    languages?: string[];
    certificationsTraining?: string[];
    awards?: string[];
  };
}

/** Maximum number of master resumes; keep in sync with backend app/database.py. */
export const MAX_MASTER_RESUMES = 5;

/** Template settings sent with a preview so the backend can fit bullets to one page. */
export interface PageFitSettings {
  template: string;
  pageSize: 'A4' | 'LETTER';
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  sectionSpacing: number;
  itemSpacing: number;
  lineHeight: number;
  fontSize: number;
  headerScale: number;
  headerFont: string;
  bodyFont: string;
  compactMode: boolean;
  showContactIcons: boolean;
  accentColor: string;
  lang?: string;
}

/** Summary of harness-steered bullet selection returned by improve/preview. */
export interface BulletSelectionSummary {
  max_per_entry: number;
  bullets_before: number;
  bullets_after: number;
  trimmed_for_fit: number;
  scoring: 'llm' | 'keyword_fallback';
  page_fit: 'fits' | 'trimmed' | 'over' | 'unavailable' | 'skipped';
  final_pages: number | null;
  /** Re-render of the rewritten result: 'skipped' means final_pages predates the rewrite. */
  final_check?: 'ok' | 'skipped' | null;
}

/** Maps builder template settings onto the PDF/page-fit parameter names. */
export function toPageFitSettings(settings: TemplateSettings, locale?: string): PageFitSettings {
  return {
    template: settings.template,
    pageSize: settings.pageSize,
    marginTop: settings.margins.top,
    marginBottom: settings.margins.bottom,
    marginLeft: settings.margins.left,
    marginRight: settings.margins.right,
    sectionSpacing: settings.spacing.section,
    itemSpacing: settings.spacing.item,
    lineHeight: settings.spacing.lineHeight,
    fontSize: settings.fontSize.base,
    headerScale: settings.fontSize.headerScale,
    headerFont: settings.fontSize.headerFont,
    bodyFont: settings.fontSize.bodyFont,
    compactMode: settings.compactMode,
    showContactIcons: settings.showContactIcons,
    accentColor: settings.accentColor,
    ...(locale ? { lang: locale } : {}),
  };
}

interface ResumeResponse {
  request_id: string;
  data: {
    resume_id: string;
    raw_resume: {
      id: number | null;
      content: string;
      content_type: string;
      created_at: string;
      processing_status: 'pending' | 'processing' | 'ready' | 'failed';
    };
    processed_resume: ProcessedResume | null;
    cover_letter?: string | null;
    outreach_message?: string | null;
    interview_prep?: InterviewPrepData | null;
    parent_id?: string | null; // For determining if resume is tailored
    title?: string | null;
    is_master?: boolean;
    is_default_master?: boolean;
  };
}

/** Response from resume upload endpoint */
export interface ResumeUploadResponse {
  message: string;
  request_id: string;
  resume_id: string;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
  is_master: boolean;
  is_default_master?: boolean;
}

interface ImproveResumeConfirmRequest {
  resume_id: string;
  job_id: string;
  preview_id?: string | null;
  improved_data: ResumeData;
  improvements: Array<{
    suggestion: string;
    lineNumber?: number | null;
  }>;
}

function normalizeResumeId(resumeId: string): string {
  const normalized = resumeId.trim();
  if (!normalized) {
    throw new Error('Resume ID is required.');
  }
  return normalized;
}

export interface ResumeListItem {
  resume_id: string;
  filename: string | null;
  is_master: boolean;
  is_default_master?: boolean;
  parent_id: string | null;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
  title?: string | null;
  // Optional lightweight snippet of associated job description (populated client-side)
  jobSnippet?: string;
}

async function postImprove(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<ImprovedResult> {
  let response: Response;
  try {
    // Use the configurable request timeout so NEXT_PUBLIC_REQUEST_TIMEOUT_MS
    // actually applies to the long-running improve/preview/confirm calls (#776).
    response = await apiPost(endpoint, payload, DEFAULT_TIMEOUT_MS);
  } catch (networkError) {
    console.error(`Network error during ${endpoint}:`, networkError);
    throw networkError;
  }

  const text = await response.text();
  if (!response.ok) {
    console.error('Improve failed response body:', text);
    throw new Error(`Improve failed with status ${response.status}: ${text}`);
  }

  try {
    return JSON.parse(text) as ImprovedResult;
  } catch (parseError) {
    console.error('Failed to parse improve response:', parseError, 'Raw response:', text);
    throw parseError;
  }
}

/** Uploads job descriptions and returns a job_id */
export async function uploadJobDescriptions(
  descriptions: string[],
  resumeId: string
): Promise<string> {
  const res = await apiPost('/jobs/upload', {
    job_descriptions: descriptions,
    resume_id: resumeId,
  });
  if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
  const data = await res.json();
  return data.job_id[0];
}

/** Improves the resume and returns the full preview object */
export async function improveResume(
  resumeId: string,
  jobId: string,
  promptId?: string
): Promise<ImprovedResult> {
  return postImprove('/resumes/improve', {
    resume_id: resumeId,
    job_id: jobId,
    prompt_id: promptId ?? null,
  });
}

/** Previews the resume improvement without saving */
export async function previewImproveResume(
  resumeId: string,
  jobId: string,
  promptId?: string,
  options?: { maxBulletsPerEntry?: number; pageFit?: PageFitSettings }
): Promise<ImprovedResult> {
  return postImprove('/resumes/improve/preview', {
    resume_id: resumeId,
    job_id: jobId,
    prompt_id: promptId ?? null,
    ...(options?.maxBulletsPerEntry !== undefined
      ? { max_bullets_per_entry: options.maxBulletsPerEntry }
      : {}),
    ...(options?.pageFit !== undefined ? { page_fit: options.pageFit } : {}),
  });
}

/** Confirms and saves a tailored resume */
export async function confirmImproveResume(
  payload: ImproveResumeConfirmRequest
): Promise<ImprovedResult> {
  return postImprove('/resumes/improve/confirm', payload as unknown as Record<string, unknown>);
}

/** Fetches a raw resume record for previewing the original upload */
export async function fetchResume(resumeId: string): Promise<ResumeResponse['data']> {
  const res = await apiFetch(`/resumes?resume_id=${encodeURIComponent(resumeId)}`);
  if (!res.ok) {
    throw new Error(`Failed to load resume (status ${res.status}).`);
  }
  const payload = (await res.json()) as ResumeResponse;
  // Support both raw_resume content (initial) and processed_resume (if available)
  // The viewer/builder logic should prioritize processed data if present
  return payload.data;
}

export async function fetchResumeList(includeMaster = false): Promise<ResumeListItem[]> {
  const res = await apiFetch(`/resumes/list?include_master=${includeMaster ? 'true' : 'false'}`);
  if (!res.ok) {
    throw new Error(`Failed to load resumes list (status ${res.status}).`);
  }
  const payload = (await res.json()) as { data: ResumeListItem[] };
  return payload.data;
}

export async function updateResume(
  resumeId: string,
  resumeData: ProcessedResume
): Promise<ResumeResponse['data']> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(resumeId)}`, resumeData);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update resume (status ${res.status}): ${text}`);
  }
  const payload = (await res.json()) as ResumeResponse;
  return payload.data;
}

export function getResumePdfUrl(
  resumeId: string,
  settings?: TemplateSettings,
  locale?: Locale
): string {
  const normalizedId = normalizeResumeId(resumeId);
  const params = new URLSearchParams();

  if (settings) {
    params.set('template', settings.template);
    params.set('pageSize', settings.pageSize);
    params.set('marginTop', String(settings.margins.top));
    params.set('marginBottom', String(settings.margins.bottom));
    params.set('marginLeft', String(settings.margins.left));
    params.set('marginRight', String(settings.margins.right));
    params.set('sectionSpacing', String(settings.spacing.section));
    params.set('itemSpacing', String(settings.spacing.item));
    params.set('lineHeight', String(settings.spacing.lineHeight));
    params.set('fontSize', String(settings.fontSize.base));
    params.set('headerScale', String(settings.fontSize.headerScale));
    params.set('headerFont', settings.fontSize.headerFont);
    params.set('bodyFont', settings.fontSize.bodyFont);
    params.set('compactMode', String(settings.compactMode));
    params.set('showContactIcons', String(settings.showContactIcons));
    params.set('accentColor', settings.accentColor);
  } else {
    params.set('template', 'swiss-single');
    params.set('pageSize', 'A4');
  }
  if (locale) {
    params.set('lang', locale);
  }

  return `${API_BASE}/resumes/${encodeURIComponent(normalizedId)}/pdf?${params.toString()}`;
}

export async function downloadResumePdf(
  resumeId: string,
  settings?: TemplateSettings,
  locale?: Locale
): Promise<Blob> {
  const url = getResumePdfUrl(resumeId, settings, locale);
  const res = await apiFetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to download resume (status ${res.status}): ${text}`);
  }
  return await res.blob();
}

/** Deletes a resume by ID */
export async function deleteResume(resumeId: string): Promise<void> {
  const res = await apiDelete(`/resumes/${encodeURIComponent(resumeId)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to delete resume (status ${res.status}): ${text}`);
  }
  clearResumeWizardCompletion(resumeId);
}

/** Updates the cover letter for a resume */
export async function updateCoverLetter(resumeId: string, content: string): Promise<void> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(resumeId)}/cover-letter`, { content });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update cover letter (status ${res.status}): ${text}`);
  }
}

/** Updates the outreach message for a resume */
export async function updateOutreachMessage(resumeId: string, content: string): Promise<void> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(resumeId)}/outreach-message`, {
    content,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to update outreach message (status ${res.status}): ${text}`);
  }
}

/** Renames a resume by updating its title */
export async function renameResume(resumeId: string, title: string): Promise<void> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(resumeId)}/title`, { title });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to rename resume (status ${res.status}): ${text}`);
  }
}

/** Marks a master resume as the default one used for tailoring */
export async function setDefaultMasterResume(
  resumeId: string
): Promise<{ resume_id: string; is_default_master: boolean }> {
  const normalizedId = normalizeResumeId(resumeId);
  const res = await apiPost(`/resumes/${encodeURIComponent(normalizedId)}/default`, {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to set default master resume (status ${res.status}): ${text}`);
  }
  return res.json();
}

/** Result of duplicating a resume: the copy is a new resume with its own id. */
export interface DuplicateResumeResponse {
  resume_id: string;
  title: string;
  is_master: boolean;
  is_default_master: boolean;
  parent_id: string | null;
}

/** A failed duplicate request. `message` is the server's own text for a 409. */
export class DuplicateResumeError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'DuplicateResumeError';
  }
}

/** Copies a whole resume (content, template settings, track title) into a new resume */
export async function duplicateResume(resumeId: string): Promise<DuplicateResumeResponse> {
  const normalizedId = normalizeResumeId(resumeId);
  const res = await apiPost(`/resumes/${encodeURIComponent(normalizedId)}/duplicate`, {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // A 409 (not ready yet, or master limit reached) carries a user-facing reason in `detail`.
    const detail = res.status === 409 ? parseErrorDetail(text) : null;
    throw new DuplicateResumeError(
      detail ?? `Failed to duplicate resume (status ${res.status}): ${text}`,
      res.status
    );
  }
  return res.json();
}

/** Downloads cover letter as PDF */
export function getCoverLetterPdfUrl(
  resumeId: string,
  pageSize: 'A4' | 'LETTER' = 'A4',
  locale?: Locale
): string {
  const normalizedId = normalizeResumeId(resumeId);
  const params = new URLSearchParams({ pageSize });
  if (locale) {
    params.set('lang', locale);
  }
  return `${API_BASE}/resumes/${encodeURIComponent(normalizedId)}/cover-letter/pdf?${params.toString()}`;
}

export async function downloadCoverLetterPdf(
  resumeId: string,
  pageSize: 'A4' | 'LETTER' = 'A4',
  locale?: Locale
): Promise<Blob> {
  const url = getCoverLetterPdfUrl(resumeId, pageSize, locale);
  const res = await apiFetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to download cover letter (status ${res.status}): ${text}`);
  }
  return await res.blob();
}

/** Generates a cover letter on-demand for a tailored resume */
export async function generateCoverLetter(resumeId: string): Promise<string> {
  const res = await apiPost(`/resumes/${encodeURIComponent(resumeId)}/generate-cover-letter`, {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to generate cover letter (status ${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.content;
}

/** Generates an outreach message on-demand for a tailored resume */
export async function generateOutreachMessage(resumeId: string): Promise<string> {
  const res = await apiPost(`/resumes/${encodeURIComponent(resumeId)}/generate-outreach`, {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to generate outreach message (status ${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.content;
}

/** Generates interview preparation on-demand for a tailored resume */
export async function generateInterviewPrep(resumeId: string): Promise<InterviewPrepData> {
  const res = await apiPost(`/resumes/${encodeURIComponent(resumeId)}/generate-interview-prep`, {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to generate interview preparation (status ${res.status}): ${text}`);
  }
  const data = (await res.json()) as { interview_prep: InterviewPrepData };
  return data.interview_prep;
}

/** Retries AI processing for a failed resume */
export async function retryProcessing(
  resumeId: string
): Promise<Pick<ResumeUploadResponse, 'resume_id' | 'processing_status'>> {
  const res = await apiPost(`/resumes/${encodeURIComponent(resumeId)}/retry-processing`, {});
  if (res.status === 409) {
    // Another attempt owns the row. Observe it instead of labeling it failed.
    const current = await fetchResume(resumeId);
    return { resume_id: resumeId, processing_status: current.raw_resume.processing_status };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to retry processing (status ${res.status}): ${text}`);
  }
  return res.json();
}

/** Fetches the job description used to tailor a resume */
export async function fetchJobDescription(
  resumeId: string
): Promise<{ job_id: string; content: string }> {
  const res = await apiFetch(`/resumes/${encodeURIComponent(resumeId)}/job-description`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch job description (status ${res.status}): ${text}`);
  }
  return res.json();
}
