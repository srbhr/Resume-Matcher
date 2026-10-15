import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import PrintCoverLetterPage from '@/app/print/cover-letter/[id]/page';

describe('print cover letter page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the error marker when the resume cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const element = await PrintCoverLetterPage({
      params: Promise.resolve({ id: 'missing-id' }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(element);

    expect(container.querySelector('.cover-letter-print')).toBeNull();
    expect(container.querySelector('[data-print-error]')?.textContent?.trim()).not.toBe('');
  });
});
