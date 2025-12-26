/**
 * Centralized API Client
 *
 * Single source of truth for API configuration and base fetch utilities.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export const API_BASE = `${API_URL}/api/v1`;

/**
 * Standard fetch wrapper with common error handling.
 * Returns the Response object for flexibility.
 */
export async function apiFetch(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
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
