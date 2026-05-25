import { apiPost, apiFetch } from './client';

export type ChatMode = 'qa' | 'improve' | 'tailor';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatProposal {
  kind: 'edit' | 'create';
  summary: string;
  diff_summary: string[];
  resume_json: Record<string, unknown>;
  suggested_title: string | null;
}

export interface ChatResponse {
  reply: string;
  proposal: ChatProposal | null;
}

export interface ChatRequest {
  messages: ChatMessage[];
  mode: ChatMode;
  target?: string;
  temperature?: number;
}

export async function chatWithResume(
  resumeId: string,
  payload: ChatRequest
): Promise<ChatResponse> {
  const res = await apiPost(`/chat/resume/${encodeURIComponent(resumeId)}`, payload);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `Chat request failed (${res.status})`);
  }
  return (await res.json()) as ChatResponse;
}

export interface BackupRow {
  backup_id: string;
  created_at: string | null;
  source: string | null;
  previous_title: string | null;
}

export async function listResumeBackups(resumeId: string): Promise<BackupRow[]> {
  const res = await apiFetch(`/resumes/${encodeURIComponent(resumeId)}/json/backups`);
  if (!res.ok) throw new Error(`Failed to load backups (${res.status})`);
  const data = (await res.json()) as { backups: BackupRow[] };
  return data.backups;
}

export async function restoreResumeBackup(resumeId: string, backupId: string): Promise<void> {
  const res = await apiPost(
    `/resumes/${encodeURIComponent(resumeId)}/json/backups/${encodeURIComponent(backupId)}/restore`,
    {}
  );
  if (!res.ok) throw new Error(`Failed to restore snapshot (${res.status})`);
}

export interface CreateFromJsonResponse {
  resume_id: string;
  processing_status: string;
  is_master: boolean;
}

export async function createResumeFromJson(
  resumeJson: Record<string, unknown>,
  title?: string | null
): Promise<CreateFromJsonResponse> {
  const res = await apiPost('/resumes/from-json', {
    resume_json: resumeJson,
    title: title ?? null,
  });
  if (!res.ok) throw new Error(`Failed to create resume (${res.status})`);
  return (await res.json()) as CreateFromJsonResponse;
}
