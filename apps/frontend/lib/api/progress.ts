import { API_BASE } from './client';

/** A fresh random id for GET /resumes/improve/progress/{id}: 32 hex characters. */
export function newProgressId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Follows the live stages of a running preview or writing run (server-sent
 * events). Calls `onStage` with each backend stage name; returns a function
 * that stops listening. Without EventSource it does nothing, and the caller
 * still has its elapsed timer.
 */
export function subscribeToProgress(id: string, onStage: (stage: string) => void): () => void {
  if (typeof EventSource === 'undefined') return () => undefined;
  const source = new EventSource(`${API_BASE}/resumes/improve/progress/${encodeURIComponent(id)}`);
  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as { stage?: unknown };
      if (typeof data.stage === 'string') onStage(data.stage);
    } catch {
      // A malformed event only skips one stage update.
    }
  };
  source.addEventListener('done', () => source.close());
  source.onerror = () => source.close();
  return () => source.close();
}
