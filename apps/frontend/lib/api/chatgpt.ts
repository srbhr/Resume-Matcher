import { apiFetch } from './client';

/**
 * Sign in with ChatGPT (OpenAI's official flow for open-source apps). The
 * backend holds every token; the browser only ever sees the authorization URL,
 * the connection state and the account's model list.
 */

export interface ChatGptStatus {
  connected: boolean;
  email: string | null;
  /** Signed in, but ChatGPT plan usage was not allowed on the consent screen. */
  plan_declined: boolean;
}

export interface ChatGptModel {
  slug: string;
  display_name: string;
}

/** Outcome codes the backend appends as `?chatgpt=` when it returns to Settings. */
export type ChatGptReturnOutcome = 'connected' | 'plan_declined' | 'cancelled' | 'error';

export const CHATGPT_RETURN_OUTCOMES: readonly ChatGptReturnOutcome[] = [
  'connected',
  'plan_declined',
  'cancelled',
  'error',
];

/** Where users review and limit what this app may use of their plan. */
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage';

/** Thrown with the HTTP status so the panel can choose a translated message. */
export class ChatGptRequestError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ChatGptRequestError';
  }
}

async function request<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const res = await apiFetch(`/config/chatgpt/${path}`, { method, credentials: 'include' });
  const body = await res.json().catch(() => null);
  if (!res.ok || body === null) {
    const detail = typeof body?.detail === 'string' ? body.detail : `status ${res.status}`;
    throw new ChatGptRequestError(res.status, detail);
  }
  return body as T;
}

export function fetchChatGptStatus(): Promise<ChatGptStatus> {
  return request<ChatGptStatus>('status');
}

/** Starts a sign-in attempt and returns the OpenAI URL to open in this tab. */
export async function startChatGptLogin(): Promise<string> {
  const { authorization_url } = await request<{ authorization_url: string }>('login', 'POST');
  return authorization_url;
}

/** `revoked` is false when OpenAI did not confirm the session was ended. */
export function disconnectChatGpt(): Promise<{ revoked: boolean }> {
  return request<{ revoked: boolean }>('logout', 'POST');
}

export async function fetchChatGptModels(): Promise<ChatGptModel[]> {
  const { models } = await request<{ models: ChatGptModel[] }>('models');
  return models;
}
