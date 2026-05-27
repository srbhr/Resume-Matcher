import { apiPost, apiPut, apiDelete, apiFetch } from './client';

export type ChatMode = 'qa' | 'improve' | 'tailor';
export type DocumentType = 'resume' | 'cv' | 'coverLetter' | 'outreach';
export type DocumentChatMode = 'discuss' | 'edit';

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

// ---------------------------------------------------------------------------
// Document chat (multi-document: resume, CV, cover letter, outreach)
// ---------------------------------------------------------------------------

export interface DiffHunk {
  hunk_id: string;
  label: string;
  original_text: string;
  proposed_text: string;
  reason: string;
  field_path?: string;
  change_type?: string;
}

export interface EditProposal {
  proposal_id: string;
  summary: string;
  hunks: DiffHunk[];
  snapshot_id: string | null;
}

export interface DocumentChatRequest {
  messages: ChatMessage[];
  document_type: DocumentType;
  mode: DocumentChatMode;
  temperature?: number;
}

export interface DocumentChatResponse {
  reply: string;
  proposal: EditProposal | null;
}

export async function chatWithDocument(
  resumeId: string,
  payload: DocumentChatRequest
): Promise<DocumentChatResponse> {
  const res = await apiPost(`/chat/document/${encodeURIComponent(resumeId)}`, payload);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `Document chat request failed (${res.status})`);
  }
  return (await res.json()) as DocumentChatResponse;
}

export interface HunkVerdict {
  hunk_id: string;
  accepted: boolean;
}

export interface ApplyHunksRequest {
  proposal_id: string;
  document_type: DocumentType;
  verdicts: HunkVerdict[];
  hunks: DiffHunk[];
}

export interface ApplyHunksResponse {
  applied_count: number;
  rejected_count: number;
}

export async function applyHunkVerdicts(
  resumeId: string,
  payload: ApplyHunksRequest
): Promise<ApplyHunksResponse> {
  const res = await apiPost(`/chat/document/${encodeURIComponent(resumeId)}/apply`, payload);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `Failed to apply hunks (${res.status})`);
  }
  return (await res.json()) as ApplyHunksResponse;
}

// ---------------------------------------------------------------------------
// Conversation history
// ---------------------------------------------------------------------------

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  conversation_id: string;
  document_type: string;
  mode: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
  pinned: boolean;
  message_count: number;
  messages: ConversationMessage[];
}

export async function listConversations(resumeId: string): Promise<Conversation[]> {
  const res = await apiFetch(`/chat/conversations/${encodeURIComponent(resumeId)}`);
  if (!res.ok) throw new Error(`Failed to load conversations (${res.status})`);
  const data = (await res.json()) as { conversations: Conversation[] };
  return data.conversations;
}

export async function createConversation(
  resumeId: string,
  payload: { document_type: string; mode: string; messages: ConversationMessage[]; title: string }
): Promise<Conversation> {
  const res = await apiPost(`/chat/conversations/${encodeURIComponent(resumeId)}`, payload);
  if (!res.ok) throw new Error(`Failed to save conversation (${res.status})`);
  return (await res.json()) as Conversation;
}

export async function updateConversationMessages(
  resumeId: string,
  conversationId: string,
  messages: ConversationMessage[]
): Promise<Conversation> {
  const res = await apiPut(
    `/chat/conversations/${encodeURIComponent(resumeId)}/${encodeURIComponent(conversationId)}`,
    { messages }
  );
  if (!res.ok) throw new Error(`Failed to update conversation (${res.status})`);
  return (await res.json()) as Conversation;
}

export async function deleteConversation(resumeId: string, conversationId: string): Promise<void> {
  const res = await apiDelete(
    `/chat/conversations/${encodeURIComponent(resumeId)}/${encodeURIComponent(conversationId)}`
  );
  if (!res.ok) throw new Error(`Failed to delete conversation (${res.status})`);
}

export async function toggleConversationPin(
  resumeId: string,
  conversationId: string
): Promise<Conversation> {
  const res = await apiPost(
    `/chat/conversations/${encodeURIComponent(resumeId)}/${encodeURIComponent(conversationId)}/pin`,
    {}
  );
  if (!res.ok) throw new Error(`Failed to toggle pin (${res.status})`);
  return (await res.json()) as Conversation;
}
