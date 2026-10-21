import { API_BASE } from './client';

/** A fresh id for GET /resumes/improve/progress/{id}; letters and digits only. */
export function newProgressId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return uuid.replace(/[^A-Za-z0-9]/g, '');
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
