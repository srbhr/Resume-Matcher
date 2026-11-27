import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResumeData } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

/**
 * Templates other than Single column load when a resume uses them. If one's code
 * fails to load in the browser, the resume shows in Single column instead of
 * the page failing.
 */
const data: ResumeData = {
  personalInfo: { name: 'Sarah Chen', title: 'Staff Engineer', email: 'sarah@example.com' },
  summary: 'Builds retrieval pipelines.',
};

afterEach(() => {
  vi.doUnmock('@/components/resume/resume-deedy');
  vi.restoreAllMocks();
});

describe('a template whose code fails to load', () => {
  it('shows the resume in Single column and logs which template failed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.doMock('@/components/resume/resume-deedy', () => {
      throw new Error('ChunkLoadError');
    });
    vi.resetModules();
    const { default: Resume } = await import('@/components/dashboard/resume-component');

    render(<Resume resumeData={data} template="deedy" />);

    expect(await screen.findByText('Builds retrieval pipelines.')).toBeInTheDocument();
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(error).toHaveBeenCalledWith(
      'The Deedy template failed to load; showing Single column.',
      expect.anything()
    );
  });
});
