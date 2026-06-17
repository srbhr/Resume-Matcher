import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE, apiFetch, apiPost, getUploadUrl } from '@/lib/api/client';

/**
 * The single backend client. Tests cover URL resolution, JSON POST shape, and
 * the timeout → friendly-message behavior (240s matches the backend wait_for).
 * `fetch` is stubbed so nothing hits the network.
 */

describe('api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('API_BASE / getUploadUrl', () => {
    it('defaults to /api/v1 in the browser env', () => {
      expect(API_BASE).toBe('/api/v1');
      expect(getUploadUrl()).toBe('/api/v1/resumes/upload');
    });
  });

  describe('apiFetch URL resolution', () => {
    it('prefixes a relative endpoint with API_BASE and passes an abort signal', async () => {
      await apiFetch('/health');
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/health',
        expect.objectContaining({ signal: expect.anything() })
      );
    });

    it('adds a leading slash to a bare endpoint', async () => {
      await apiFetch('health');
      expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/health');
    });

    it('passes absolute URLs through untouched', async () => {
      await apiFetch('https://example.com/x');
      expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/x');
    });
  });

  describe('apiPost', () => {
    it('sends a JSON body with POST + Content-Type', async () => {
      await apiPost('/jobs/upload', { job_descriptions: ['x'] });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/v1/jobs/upload');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(init.body).toBe(JSON.stringify({ job_descriptions: ['x'] }));
    });
  });

  describe('timeout / error handling', () => {
    it('maps an AbortError to a friendly timeout message', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      fetchMock.mockRejectedValueOnce(abortErr);
      await expect(apiFetch('/slow')).rejects.toThrow(/timed out/i);
    });

    it('rethrows non-abort errors unchanged', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network boom'));
      await expect(apiFetch('/x')).rejects.toThrow('network boom');
    });

    it('aborts after the timeout and reports a timeout error', async () => {
      vi.useFakeTimers();
      try {
        fetchMock.mockImplementation((_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const e = new Error('The operation was aborted');
              e.name = 'AbortError';
              reject(e);
            });
          })
        );
        const promise = apiFetch('/slow', undefined, 5000);
        const expectation = expect(promise).rejects.toThrow(/timed out/i);
        await vi.advanceTimersByTimeAsync(5000);
        await expectation;
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
