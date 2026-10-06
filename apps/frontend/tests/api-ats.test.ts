import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkResumeParse } from '@/lib/api/ats';
import { toPageFitSettings } from '@/lib/api/resume';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

describe('checkResumeParse', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the same print settings the PDF download uses', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ checks: [] }), { status: 200 }));
    const settings = { ...DEFAULT_TEMPLATE_SETTINGS, template: 'clean' as const };
    await checkResumeParse('res 1', settings, 'ja');
    const [url, options] = fetchMock.mock.calls.at(-1)!;
    expect(String(url)).toContain('/resumes/res%201/parse-check');
    expect((options as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((options as RequestInit).body))).toEqual(
      toPageFitSettings(settings, 'ja')
    );
  });

  it('surfaces the backend detail on failure', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Resume not found' }), { status: 404 })
    );
    await expect(checkResumeParse('x', DEFAULT_TEMPLATE_SETTINGS)).rejects.toThrow(
      'Resume not found'
    );
  });
});
