import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HighlightedResumeView } from '@/components/builder/highlighted-resume-view';
import type { ResumeData } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

const resume = {
  workExperience: [
    {
      id: 1,
      title: 'Engineer',
      company: 'Acme',
      description: ['Built the API', 'Wrote the docs'],
      descriptionStyles: ['bullet', 'plain'],
    },
  ],
  personalProjects: [{ id: 1, name: 'Matcher', description: ['Shipped it'] }],
} as unknown as ResumeData;

describe('HighlightedResumeView bullets', () => {
  it('marks bullet rows with a square ink marker, not an entity bullet', () => {
    const { container } = render(
      <HighlightedResumeView resumeData={resume} keywords={new Set()} />
    );

    const markers = container.querySelectorAll('li > span[aria-hidden="true"]');
    // Experience bullet row plus the project row; the "plain" row carries none.
    expect(markers).toHaveLength(2);
    for (const marker of markers) {
      expect(marker).toHaveClass('size-1', 'bg-ink', 'shrink-0');
      expect(marker.textContent).toBe('');
    }
    expect(container.textContent).not.toContain('•');
  });
});
