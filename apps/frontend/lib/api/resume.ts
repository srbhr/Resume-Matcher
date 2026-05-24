import { ImprovedResult } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { type TemplateSettings } from '@/lib/types/template-settings';
import { type Locale } from '@/i18n/config';
import { API_BASE, apiPost, apiPatch, apiDelete, apiFetch } from './client';

// Matches backend schemas/models.py ResumeData
interface ProcessedResume {
  personalInfo?: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    links?: string | null;
    orcid?: string | null;
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
  }>;
  additional?: {
    technicalSkills?: string[];
    languages?: string[];
    certificationsTraining?: string[];
    awards?: string[];
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
    parent_id?: string | null; // For determining if resume is tailored
    is_master?: boolean;
    title?: string | null;
    template_settings?: Record<string, unknown> | null;
    document_kind?: 'resume' | 'cv';
    resume_doc_id?: string | null;
    cv_doc_id?: string | null;
    resume_download_filename?: string | null;
    cv_download_filename?: string | null;
  };
}

/** Response from resume upload endpoint */
export interface ResumeUploadResponse {
  message: string;
  request_id: string;
  resume_id: string;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
  is_master: boolean;
  document_kind?: 'resume' | 'cv';
  cv_resume_id?: string | null;
}

export type DocumentKind = 'resume' | 'cv';

interface ImproveResumeConfirmRequest {
  resume_id: string;
  job_id: string;
  improved_data: ResumeData;
  improvements: Array<{
    suggestion: string;
    lineNumber?: number | null;
  }>;
  cover_letter_guidance?: string | null;
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
  parent_id: string | null;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
  title?: string | null;
  document_kind?: 'resume' | 'cv';
  // Optional lightweight snippet of associated job description (populated client-side)
  jobSnippet?: string;
}

async function postImprove(
  endpoint: string,
  payload: Record<string, unknown>
): Promise<ImprovedResult> {
  let response: Response;
  try {
    response = await apiPost(endpoint, payload, 1_800_000);
  } catch (networkError) {
    console.error(`Network error during ${endpoint}:`, networkError);
    throw networkError;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('Improve failed response body:', text);
    throw new Error(`Improve failed with status ${response.status}: ${text}`);
  }

  // /improve/preview uses SSE to send keep-alive pings while the LLM runs,
  // preventing the Next.js dev-server proxy from killing the idle socket.
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    return _readImproveSSE(response);
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as ImprovedResult;
  } catch (parseError) {
    console.error('Failed to parse improve response:', parseError, 'Raw response:', text);
    throw parseError;
  }
}

/**
 * Read an SSE stream produced by /improve/preview.
 * Ignores ": keep-alive" comments; returns the parsed JSON from the data event.
 */
async function _readImproveSSE(response: Response): Promise<ImprovedResult> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are delimited by blank lines (\n\n)
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const trimmed = event.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // keep-alive / comment

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (parsed.__error__) {
            throw new Error(String(parsed.__error__));
          }
          return parsed as unknown as ImprovedResult;
        }
      }
    }

    // Handle any data remaining in buffer without a trailing \n\n
    const tail = buffer.trim();
    if (tail.startsWith('data: ')) {
      const data = tail.slice(6).trim();
      if (data && data !== '[DONE]') {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (parsed.__error__) throw new Error(String(parsed.__error__));
        return parsed as unknown as ImprovedResult;
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error('SSE stream ended without a result');
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
  promptId?: string
): Promise<ImprovedResult> {
  return postImprove('/resumes/improve/preview', {
    resume_id: resumeId,
    job_id: jobId,
    prompt_id: promptId ?? null,
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
  locale?: Locale,
  qrCodeSettings?: { url: string; sizeMm: number; xMm: number; yMm: number }
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
    params.set('baseSizePt', String(settings.fontSize.baseSizePt));
    params.set('sectionHeaderSizePt', String(settings.fontSize.sectionHeaderSizePt));
    params.set('headerFont', settings.fontSize.headerFont);
    params.set('bodyFont', settings.fontSize.bodyFont);
    params.set('compactMode', String(settings.compactMode));
    params.set('showContactIcons', String(settings.showContactIcons));
    params.set('accentColor', settings.accentColor);
    params.set('nameSizePt', String(settings.fontSize.nameSizePt));
    params.set('contactSizePt', String(settings.fontSize.contactSizePt));
    params.set('bodySizePt', String(settings.fontSize.bodySizePt));
    params.set('sectionHeaderBold', String(settings.textStyle.sectionHeaderBold));
    params.set('sectionHeaderItalic', String(settings.textStyle.sectionHeaderItalic));
    params.set('itemTitleBold', String(settings.textStyle.itemTitleBold));
    params.set('itemTitleItalic', String(settings.textStyle.itemTitleItalic));
    params.set('itemSubtitleBold', String(settings.textStyle.itemSubtitleBold));
    params.set('itemSubtitleItalic', String(settings.textStyle.itemSubtitleItalic));
  } else {
    params.set('template', 'swiss-single');
    params.set('pageSize', 'A4');
  }
  if (locale) {
    params.set('lang', locale);
  }

  if (qrCodeSettings && qrCodeSettings.url) {
    params.set('qrCodeUrl', qrCodeSettings.url);
    params.set('qrCodeSizeMm', String(qrCodeSettings.sizeMm));
    params.set('qrCodeXMm', String(qrCodeSettings.xMm));
    params.set('qrCodeYMm', String(qrCodeSettings.yMm));
  }

  return `${API_BASE}/resumes/${encodeURIComponent(normalizedId)}/pdf?${params.toString()}`;
}

export async function downloadResumePdf(
  resumeId: string,
  settings?: TemplateSettings,
  locale?: Locale,
  qrCodeSettings?: { url: string; sizeMm: number; xMm: number; yMm: number }
): Promise<Blob> {
  const url = getResumePdfUrl(resumeId, settings, locale, qrCodeSettings);
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

/** Saves template/formatting settings (fonts, sizes, styles) for a resume */
export async function saveTemplateSettings(
  resumeId: string,
  settings: TemplateSettings
): Promise<void> {
  const res = await apiPatch(`/resumes/${encodeURIComponent(resumeId)}/template-settings`, {
    settings,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to save template settings (status ${res.status}): ${text}`);
  }
}

/** Creates a blank master resume for building from scratch */
export async function createBlankMasterResume(): Promise<ResumeUploadResponse> {
  const res = await apiPost('/resumes/create-blank', {});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create blank resume (status ${res.status}): ${text}`);
  }
  return res.json();
}

/** Uploads a Resume and/or CV as a single master group */
export async function uploadResumeBundle(opts: {
  resumeFile?: File | null;
  cvFile?: File | null;
  groupName?: string;
  resumeFilename?: string;
  cvFilename?: string;
}): Promise<ResumeUploadResponse> {
  if (!opts.resumeFile && !opts.cvFile) {
    throw new Error('At least one of resumeFile or cvFile must be provided.');
  }
  const formData = new FormData();
  if (opts.resumeFile) formData.append('resume_file', opts.resumeFile);
  if (opts.cvFile) formData.append('cv_file', opts.cvFile);
  if (opts.groupName) formData.append('group_name', opts.groupName);
  if (opts.resumeFilename) formData.append('resume_filename', opts.resumeFilename);
  if (opts.cvFilename) formData.append('cv_filename', opts.cvFilename);

  const res = await apiFetch('/resumes/upload-bundle', { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (status ${res.status}): ${text}`);
  }
  return (await res.json()) as ResumeUploadResponse;
}

/** Generates the missing Resume or CV from the existing counterpart */
export async function generateCounterpart(
  masterId: string,
  target: DocumentKind
): Promise<{
  message: string;
  resume_id: string;
  target: DocumentKind;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
}> {
  const res = await apiPost(`/resumes/${encodeURIComponent(masterId)}/generate-counterpart`, {
    target,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to generate ${target} (status ${res.status}): ${text}`);
  }
  return res.json();
}

/** Retries AI processing for a failed resume */
export async function retryProcessing(resumeId: string): Promise<ResumeUploadResponse> {
  const res = await apiPost(`/resumes/${encodeURIComponent(resumeId)}/retry-processing`, {});
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
