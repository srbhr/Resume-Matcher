import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteQueueItem, parseJobMetadata, QueueItemInProgressError } from '@/lib/api/resume';

describe('queue API client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns detected job details', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ role: 'Dev', company: 'Acme', job_req_id: 'R1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(parseJobMetadata('Job Title: Dev')).resolves.toEqual({
      role: 'Dev',
      company: 'Acme',
      job_req_id: 'R1',
    });
  });

  it('throws on a failed detection instead of reporting "nothing found"', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(parseJobMetadata('Job Title: Dev')).rejects.toThrow('500');
  });

  it('tells an in-flight item apart from other delete failures', async () => {
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 409 }));
    await expect(deleteQueueItem('q1')).rejects.toBeInstanceOf(QueueItemInProgressError);
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const failure = deleteQueueItem('q1');
    await expect(failure).rejects.toThrow('500');
    await expect(failure).rejects.not.toBeInstanceOf(QueueItemInProgressError);
  });
});
