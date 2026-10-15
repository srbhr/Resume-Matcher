// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Print pages fetch the backend server-side. They must use BACKEND_ORIGIN, the
 * same origin the /api proxy uses, or exports hang when the backend is not on
 * 127.0.0.1:8000.
 */
describe('server-side API_BASE', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to the local backend', async () => {
    vi.stubEnv('BACKEND_ORIGIN', '');
    const { API_BASE } = await import('@/lib/api/client');
    expect(API_BASE).toBe('http://127.0.0.1:8000/api/v1');
  });

  it('follows BACKEND_ORIGIN', async () => {
    vi.stubEnv('BACKEND_ORIGIN', 'http://backend:9000/');
    const { API_BASE } = await import('@/lib/api/client');
    expect(API_BASE).toBe('http://backend:9000/api/v1');
  });
});
