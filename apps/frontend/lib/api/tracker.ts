import { apiFetch, apiPost, apiPatch, apiDelete } from './client';

// The seven stable Kanban columns (keys are decoupled from i18n labels).
export type ApplicationStatus =
  | 'saved'
  | 'applied'
  | 'no_response'
  | 'response'
  | 'interview'
  | 'accepted'
  | 'rejected';

export const APPLICATION_STATUS_ORDER: ApplicationStatus[] = [
  'saved',
  'applied',
  'no_response',
  'response',
  'interview',
  'accepted',
  'rejected',
];

export interface Application {
  application_id: string;
  job_id: string;
  resume_id: string;
  master_resume_id: string | null;
  status: ApplicationStatus;
  company: string | null;
  role: string | null;
  applied_at: string | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDetail extends Application {
  job_content: string | null;
  // The applied/tailored resume record (null when it has been deleted).
  resume: Record<string, unknown> | null;
}

export type ApplicationColumns = Record<ApplicationStatus, Application[]>;

export interface ApplicationListResponse {
  columns: ApplicationColumns;
}

export interface ManualApplicationCreate {
  resume_id: string;
  job_description: string;
  company?: string;
  role?: string;
  status?: ApplicationStatus;
  notes?: string;
}

export interface ApplicationUpdate {
  status?: ApplicationStatus;
  position?: number;
  notes?: string;
  company?: string;
  role?: string;
  applied_at?: string;
}

export interface ApplicationActionResponse {
  message: string;
  affected: number;
}

// FastAPI returns `detail` as a string for HTTPException but as an array of
// `{ msg, loc, ... }` objects for validation errors — coerce both to a string
// so error messages never render as "[object Object]".
function extractDetail(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((d) =>
        d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : null
      )
      .filter((m): m is string => Boolean(m));
    if (messages.length > 0) return messages.join('; ');
  }
  // A dict detail (e.g. HTTPException(detail={...})) — stringify so it reads as
  // something rather than "[object Object]".
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    try {
      return JSON.stringify(detail);
    } catch {
      return null;
    }
  }
  return null;
}

async function asJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(extractDetail(data) || `${fallback} (status ${res.status}).`);
  }
  return res.json() as Promise<T>;
}

// List all applications grouped by status column.
export async function listApplications(): Promise<ApplicationListResponse> {
  const res = await apiFetch('/applications', { credentials: 'include' });
  return asJson<ApplicationListResponse>(res, 'Failed to load applications');
}

// Manually add a card from a pasted job description.
export async function createApplication(payload: ManualApplicationCreate): Promise<Application> {
  const res = await apiPost('/applications', payload);
  return asJson<Application>(res, 'Failed to create application');
}

// Fetch a card with its embedded JD + applied resume (for the modal).
export async function getApplicationDetail(id: string): Promise<ApplicationDetail> {
  const res = await apiFetch(`/applications/${id}`, { credentials: 'include' });
  return asJson<ApplicationDetail>(res, 'Failed to load application');
}

// Update one card (status/position/notes/company/role/applied_at).
export async function updateApplication(
  id: string,
  payload: ApplicationUpdate
): Promise<Application> {
  const res = await apiPatch(`/applications/${id}`, payload);
  return asJson<Application>(res, 'Failed to update application');
}

// Move many cards to one column.
export async function bulkUpdateStatus(
  applicationIds: string[],
  status: ApplicationStatus
): Promise<ApplicationActionResponse> {
  const res = await apiPatch('/applications/bulk', {
    application_ids: applicationIds,
    status,
  });
  return asJson<ApplicationActionResponse>(res, 'Failed to move applications');
}

// Delete one card.
export async function deleteApplication(id: string): Promise<void> {
  const res = await apiDelete(`/applications/${id}`);
  await asJson<ApplicationActionResponse>(res, 'Failed to delete application');
}

// Delete many cards.
export async function bulkDeleteApplications(
  applicationIds: string[]
): Promise<ApplicationActionResponse> {
  const res = await apiPost('/applications/bulk-delete', { application_ids: applicationIds });
  return asJson<ApplicationActionResponse>(res, 'Failed to delete applications');
}
