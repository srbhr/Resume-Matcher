/**
 * Centralized API Client
 *
 * Single source of truth for API configuration and base fetch utilities.
 *
 * All browser (client-side) requests are routed through the Next.js proxy
 * rewrite defined in next.config.ts:
 *   /api_be/* → NEXT_PUBLIC_API_URL/*  (server-side rewrite, no CORS)
 *
 * This means the browser never makes cross-origin requests to the backend,
 * so Docker remote-server deployments work without any IP configuration or
 * CORS_ORIGINS changes.
 *
 * Server-side code (print pages, Server Components) uses API_URL directly
 * because it runs inside the container where the backend is always reachable
 * at localhost:8000.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Client-side: relative proxy path (browser → Next.js rewrite → backend).
// Server-side: absolute URL for direct container-to-container access.
export const API_BASE =
  typeof window !== 'undefined' ? '/api_be/api/v1' : `${API_URL}/api/v1`;

/**
 * Standard fetch wrapper with common error handling.
 * Returns the Response object for flexibility.
 */
export async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  // endpoint is one of:
  //   - a full URL returned by getResumePdfUrl/getCoverLetterPdfUrl (starts with API_BASE)
  //   - a path segment like /resumes/123 (prepend API_BASE)
  const url =
    endpoint.startsWith('http') || endpoint.startsWith(API_BASE)
      ? endpoint
      : `${API_BASE}${endpoint}`;
  return fetch(url, options);
}

/**
 * POST request with JSON body.
 */
export async function apiPost<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
