import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { draftSection, createResumeFromWizard } from '@/lib/api/create';

describe('create api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draftSection posts to /resumes/draft-section and returns data', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ request_id: 'r', section: 'work', data: { company: 'Google' } }),
        { status: 200 },
      ),
    );
    const data = await draftSection({ section: 'work', answers: 'google' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/resumes/draft-section');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(data).toEqual({ company: 'Google' });
  });

  it('createResumeFromWizard posts processed_data and returns resume_id + is_master', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          resume_id: 'res-1',
          is_master: true,
          processing_status: 'ready',
          message: 'ok',
          request_id: 'r',
        }),
        { status: 200 },
      ),
    );
    const res = await createResumeFromWizard({ personalInfo: { name: 'James' } });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/resumes');
    expect(res.resume_id).toBe('res-1');
    expect(res.is_master).toBe(true);
  });

  it('draftSection throws on non-ok response', async () => {
    fetchMock.mockResolvedValue(new Response('{"detail":"boom"}', { status: 500 }));
    await expect(draftSection({ section: 'skills', answers: 'x' })).rejects.toThrow();
  });
});
