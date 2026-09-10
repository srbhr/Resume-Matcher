/**
 * Centralized API Client
 *
 * Single source of truth for API configuration and base fetch utilities.
 */

const DEFAULT_PUBLIC_API_URL = '/';
const INTERNAL_API_ORIGIN = 'http://127.0.0.1:8000';

function normalizeApiUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }
  return trimmed.replace(/\/+$/, '');
}

function toApiBase(apiUrl: string): string {
  if (apiUrl === '/') {
    return '/api/v1';
  }
  return `${apiUrl}/api/v1`;
}

function resolveRuntimeApiBase(apiBase: string): string {
  if (typeof window !== 'undefined' || !apiBase.startsWith('/')) {
    return apiBase;
  }
  return `${INTERNAL_API_ORIGIN}${apiBase}`;
}

export const API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_PUBLIC_API_URL);
export const API_BASE = resolveRuntimeApiBase(toApiBase(API_URL));

// Default request timeout (ms). MUST match the backend's REQUEST_TIMEOUT_SECONDS
// and the Next.js proxyTimeout (next.config.ts) — the shortest layer aborts
// first, so all three are driven by the same NEXT_PUBLIC_REQUEST_TIMEOUT_MS env
// var. Bounded to [30s, 30min]. Local LLMs often need more than the 240s default.
const rawTimeoutMs = process.env.NEXT_PUBLIC_REQUEST_TIMEOUT_MS;
const parsedTimeoutMs = rawTimeoutMs ? Number(rawTimeoutMs) : NaN;
export const DEFAULT_TIMEOUT_MS = Number.isFinite(parsedTimeoutMs)
  ? Math.min(1_800_000, Math.max(30_000, parsedTimeoutMs))
  : 240_000;

const REQUEST_TIMEOUT_MESSAGE =
  'Request timed out. If you are running a local LLM, increase NEXT_PUBLIC_REQUEST_TIMEOUT_MS (and the backend REQUEST_TIMEOUT_SECONDS to match); otherwise try a shorter job description or check your connection.';

function createTimeoutError(): Error {
  return new Error(REQUEST_TIMEOUT_MESSAGE);
}

function createAbortError(reason: unknown): Error {
  const error = new Error('The operation was aborted.', { cause: reason });
  error.name = 'AbortError';
  return error;
}

async function bufferResponse(response: Response): Promise<Response> {
  if (response.body === null || response.status < 200 || response.status > 599) {
    return response;
  }

  const body = await response.arrayBuffer();
  const buffered = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  Object.defineProperties(buffered, {
    url: { value: response.url },
    redirected: { value: response.redirected },
    type: { value: response.type },
  });
  return buffered;
}

/**
 * Standard fetch wrapper with common error handling.
 * Returns the Response object for flexibility.
 *
 * @param endpoint - API endpoint path or absolute URL
 * @param options - Standard RequestInit options
 * @param timeoutMs - Optional request timeout in milliseconds (default: DEFAULT_TIMEOUT_MS, from NEXT_PUBLIC_REQUEST_TIMEOUT_MS, 240_000 if unset)
 */
export async function apiFetch(
  endpoint: string,
  options?: RequestInit,
  timeoutMs?: number
): Promise<Response> {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const isAbsoluteUrl = endpoint.startsWith('http://') || endpoint.startsWith('https://');
  const isApiPath = normalizedEndpoint.startsWith('/api/');
  let url = `${API_BASE}${normalizedEndpoint}`;

  if (isAbsoluteUrl) {
    url = endpoint;
  } else if (isApiPath) {
    url = resolveRuntimeApiBase(normalizedEndpoint);
  }

  // Defaults to DEFAULT_TIMEOUT_MS, which tracks the backend's
  // REQUEST_TIMEOUT_SECONDS (see next.config.ts proxyTimeout — all three layers
  // must agree or the shortest aborts first).
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const callerSignal = options?.signal;
  const controller = new AbortController();
  let timedOut = false;
  let rejectCancellation: (reason: unknown) => void = () => undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject;
  });
  // A request may finish normally without racing this rejection. Attach a
  // handler immediately so a later abort never becomes an unhandled rejection.
  void cancellation.catch(() => undefined);

  const handleInternalAbort = () => {
    rejectCancellation(
      timedOut ? createTimeoutError() : createAbortError(controller.signal.reason)
    );
  };
  const handleCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };

  controller.signal.addEventListener('abort', handleInternalAbort, { once: true });
  if (callerSignal) {
    if (callerSignal.aborted) {
      handleCallerAbort();
    } else {
      callerSignal.addEventListener('abort', handleCallerAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  try {
    const request = fetch(url, { ...options, signal: controller.signal }).then(bufferResponse);
    return await Promise.race([request, cancellation]);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (callerSignal?.aborted) {
        throw createAbortError(callerSignal.reason);
      }
      throw createTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', handleInternalAbort);
    callerSignal?.removeEventListener('abort', handleCallerAbort);
  }
}

/**
 * POST request with JSON body.
 */
export async function apiPost<T>(endpoint: string, body: T, timeoutMs?: number): Promise<Response> {
  return apiFetch(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
}

/**
 * PATCH request with JSON body.
 */
export async function apiPatch<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * PUT request with JSON body.
 */
export async function apiPut<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request.
 */
export async function apiDelete(endpoint: string): Promise<Response> {
  return apiFetch(endpoint, { method: 'DELETE' });
}

/**
 * Builds the full upload URL for file uploads.
 */
export function getUploadUrl(): string {
  return `${API_BASE}/resumes/upload`;
}
