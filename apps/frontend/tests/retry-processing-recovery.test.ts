import { afterEach, expect, it, vi } from 'vitest';
import { retryProcessing } from '@/lib/api/resume';

afterEach(() => vi.unstubAllGlobals());
it('reads the current attempt after a superseded retry instead of reporting failure', async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requests.push(url);
      return url.endsWith('/retry-processing')
        ? new Response(JSON.stringify({ detail: 'Superseded attempt' }), { status: 409 })
        : new Response(
            JSON.stringify({
              data: {
                resume_id: 'r',
                processed_resume: null,
                raw_resume: { processing_status: 'processing' },
              },
            })
          );
    })
  );
  await expect(retryProcessing('r')).resolves.toMatchObject({
    resume_id: 'r',
    processing_status: 'processing',
  });
  expect(requests).toEqual(['/api/v1/resumes/r/retry-processing', '/api/v1/resumes?resume_id=r']);
});
