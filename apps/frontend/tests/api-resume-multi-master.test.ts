import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewImproveResume, setDefaultMasterResume, toPageFitSettings } from '@/lib/api/resume';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

afterEach(() => vi.unstubAllGlobals());

function okJson(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe('multi-master api client', () => {
  it('setDefaultMasterResume posts to the default endpoint', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockImplementation(() => okJson({ resume_id: 'r2', is_default_master: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(setDefaultMasterResume('r2')).resolves.toEqual({
      resume_id: 'r2',
      is_default_master: true,
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/resumes\/r2\/default$/);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('setDefaultMasterResume throws a useful error on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 404 })))
    );
    await expect(setDefaultMasterResume('r2')).rejects.toThrow(
      'Failed to set default master resume (status 404)'
    );
  });

  it('previewImproveResume sends bullet cap and page fit', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockImplementation(() => okJson({ request_id: 'x', data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const pageFit = toPageFitSettings(DEFAULT_TEMPLATE_SETTINGS, 'en');
    await previewImproveResume('r1', 'j1', undefined, { maxBulletsPerEntry: 3, pageFit });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_bullets_per_entry).toBe(3);
    expect(body.page_fit).toMatchObject({ template: 'swiss-single', pageSize: 'A4', lang: 'en' });
  });

  it('previewImproveResume body is unchanged when options are omitted', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockImplementation(() => okJson({ request_id: 'x', data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await previewImproveResume('r1', 'j1');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ resume_id: 'r1', job_id: 'j1', prompt_id: null });
    expect(body).not.toHaveProperty('max_bullets_per_entry');
    expect(body).not.toHaveProperty('page_fit');
  });

  it('toPageFitSettings maps template settings onto pdf param names', () => {
    const fit = toPageFitSettings({ ...DEFAULT_TEMPLATE_SETTINGS, compactMode: true });
    expect(fit).toMatchObject({
      marginTop: DEFAULT_TEMPLATE_SETTINGS.margins.top,
      sectionSpacing: DEFAULT_TEMPLATE_SETTINGS.spacing.section,
      fontSize: DEFAULT_TEMPLATE_SETTINGS.fontSize.base,
      compactMode: true,
    });
    expect(fit).not.toHaveProperty('lang');
  });
});
