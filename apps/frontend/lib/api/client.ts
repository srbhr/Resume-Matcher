/**
 * Centralized API Client
 *
 * All API calls now go through Next.js API routes (/api/*) which proxy to the backend.
 * This eliminates CORS issues entirely by keeping all browser requests same-origin.
 *
 * Flow: Browser → Next.js /api/* (same-origin) → Backend (server-to-server)
 */

/**
 * Returns the API base URL.
 *
 * - Client-side: Always uses relative path /api (same-origin, no CORS)
 * - Server-side: Uses BACKEND_URL env var to connect directly to backend
 */
export function getApiBase(): string {
  // Server-side: Connect directly to backend
  if (typeof window === 'undefined') {
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return `${backendUrl.replace(/\/+$/, '')}/api/v1`;
  }

  // Client-side: Use Next.js API proxy (same-origin, no CORS)
  return '/api';
}

// Legacy export for backwards compatibility
export const API_URL = typeof window === 'undefined'
  ? (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000')
  : window.location.origin;

// Legacy export - API_BASE is now same as getApiBase()
export const API_BASE = getApiBase();

/**
 * Standard fetch wrapper with common error handling.
 * Returns the Response object for flexibility.
 */
export async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  const base = getApiBase();
  const url = endpoint.startsWith('http') ? endpoint : `${base}${endpoint}`;
  return fetch(url, options);
}

export async function apiPost<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function apiPatch<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function apiPut<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function apiDelete(endpoint: string): Promise<Response> {
  return apiFetch(endpoint, { method: 'DELETE' });
}

export function getUploadUrl(): string {
  return `${getApiBase()}/resumes/upload`;
}
