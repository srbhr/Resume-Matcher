import type { paths } from './types';
import { mapFetchError, DomainError } from './errors';

// Basic typed fetch helper
export interface ApiFetchParams extends RequestInit {
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

// Generic typed fetch (response inferred via caller supplied generic R)
export async function apiFetch<P extends keyof paths, M extends keyof paths[P] & string, R = unknown>(
  path: P,
  method: M,
  params: ApiFetchParams = {}
): Promise<R> {
  const { timeoutMs = 30000, query, ...init } = params;
  // Prefer proxy path in app (rewritten to backend) when no explicit base is set
  const isRelativeApi = !process.env.NEXT_PUBLIC_API_BASE && !String(path).startsWith('/api/v1/') ? false : true;
  const backendDefault = process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : 'https://resume-matcher-backend-j06k.onrender.com';
  const base = process.env.NEXT_PUBLIC_API_BASE || backendDefault;
  let url = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL)
    ? base + path
    : (String(path).startsWith('/api/v1/') ? '/api_be' + path.replace(/^\/api\/v1\//, '/api/v1/') : base + path);
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => k + '=' + encodeURIComponent(String(v)))
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: method.toUpperCase(), ...init, signal: controller.signal });
    if (!res.ok) {
      let body: unknown = undefined;
      try { body = await res.clone().json(); } catch { /* ignore parse */ }
      throw mapFetchError({ status: res.status, data: body }, { status: res.status, path: String(path) });
    }
    const ct = res.headers.get('content-type') || '';
    return (ct.includes('application/json') ? await res.json() : await res.text()) as R;
  } catch (e: unknown) {
    if (e instanceof DomainError) throw e;
    throw mapFetchError(e, { path: String(path) });
  } finally {
    clearTimeout(to);
  }
}

// --- Domain Specific Wrapper Functions ---
// Minimal response type shapes (extend later with precise OpenAPI types as needed)
export interface ResumeApiResponse { resume_id?: string; processed_resume?: Record<string, unknown>; [k: string]: unknown }
export interface JobApiResponse { job_id?: string; processed_job?: Record<string, unknown>; [k: string]: unknown }
export interface ImproveResumePayload { resume_id: string; job_id: string; stream?: boolean; require_llm?: boolean }
export interface ImproveResumeResponse { improved_resume?: string; scores?: Record<string, unknown>; [k: string]: unknown }
export interface UploadResumeResponse { resume_id: string }
export interface UploadJobResponse { job_id: string | string[] }
export interface MatchResumeRequest { resume_id: string; job_id: string }
export interface MatchResumeResponseData {
  resume_id: string;
  job_id: string;
  score: number;
  breakdown: Record<string, number> & { final_score?: number };
  counts: Record<string, number>;
}
export interface MatchResumeResponse { request_id?: string; data: MatchResumeResponseData }

export async function getResume(resume_id: string): Promise<ResumeApiResponse> {
  return apiFetch('/api/v1/resumes', 'get', { query: { resume_id } });
}

export async function getJob(job_id: string): Promise<JobApiResponse> {
  return apiFetch('/api/v1/jobs', 'get', { query: { job_id } });
}

export async function improveResume(payload: ImproveResumePayload): Promise<ImproveResumeResponse> {
  const query: Record<string, string | number | boolean | undefined> = {};
  if (payload.stream) query.stream = true;
  // default to require_llm=true unless explicitly set false
  if (payload.require_llm !== false) query.require_llm = true;
  return apiFetch('/api/v1/resumes/improve', 'post', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    query,
    timeoutMs: 60000,
  });
}

export async function uploadResumeFile(file: File, defer = true): Promise<UploadResumeResponse> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/api/v1/resumes/upload', 'post', {
    body: form,
    query: { defer },
  });
}

export async function uploadJobText(text: string): Promise<UploadJobResponse> {
  const blob = new Blob([text], { type: 'text/plain' });
  const file = new File([blob], 'job.txt', { type: 'text/plain' });
  return apiFetch('/api/v1/jobs/upload', 'post', {
    body: (() => { const f = new FormData(); f.append('file', file); return f; })()
  });
}

export async function matchResumeJob(payload: MatchResumeRequest): Promise<MatchResumeResponse> {
  return apiFetch('/api/v1/match' as keyof paths, 'post', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
