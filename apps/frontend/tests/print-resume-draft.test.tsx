import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/dashboard/resume-component', () => ({
  default: () => <div data-testid="resume" />,
}));

import PrintResumePage from '@/app/print/resumes/[id]/page';

const TOKEN = 'a'.repeat(32);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function renderPrintPage(id: string, draft?: string) {
  const element = await PrintResumePage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(draft ? { draft } : {}),
  });
  return render(element);
}

describe('print route page-fit drafts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the error marker, not .resume-print, when the draft token is unknown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { detail: 'Draft not found' }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = await renderPrintPage('draft', TOKEN);

    expect(fetchMock.mock.calls[0][0]).toContain(`/resumes/render-drafts/${TOKEN}`);
    expect(container.querySelector('.resume-print')).toBeNull();
    const marker = container.querySelector('[data-print-error]');
    expect(marker).not.toBeNull();
    // Playwright only matches visible elements, so the marker must have content.
    expect(marker?.textContent?.trim()).not.toBe('');
  });

  it('renders the error marker when the draft endpoint cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const { container } = await renderPrintPage('draft', TOKEN);

    expect(container.querySelector('.resume-print')).toBeNull();
    expect(container.querySelector('[data-print-error]')).not.toBeNull();
  });

  it('still renders .resume-print for a stored draft', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { data: { processed_resume: { personalInfo: { name: 'Jane' } } } })
        )
    );

    const { container } = await renderPrintPage('draft', TOKEN);

    expect(container.querySelector('.resume-print')).not.toBeNull();
    expect(container.querySelector('[data-print-error]')).toBeNull();
  });

  // A thrown error rendered Next's error page, which has no .resume-print, so the
  // PDF export waited out its whole deadline (about 60s) before failing.
  it('renders the error marker for a saved resume that cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));

    const { container } = await renderPrintPage('missing-id');

    expect(container.querySelector('.resume-print')).toBeNull();
    expect(container.querySelector('[data-print-error]')?.textContent?.trim()).not.toBe('');
  });

  it('renders the error marker for a resume whose content is not structured data', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { data: { raw_resume: { content: '# Jane Doe (markdown)' } } })
        )
    );

    const { container } = await renderPrintPage('unparsed-id');

    expect(container.querySelector('.resume-print')).toBeNull();
    expect(container.querySelector('[data-print-error]')).not.toBeNull();
  });
});
