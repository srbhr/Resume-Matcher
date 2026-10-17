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

describe('HighlightedResumeView coverage', () => {
  it('shows a highlight for every field the keyword match counts', () => {
    const data = {
      education: [{ id: 1, degree: 'BSc', institution: 'U', description: 'Thesis on Rust' }],
      additional: { awards: ['Kubernetes award'] },
      sectionMeta: [{ id: 'talks', key: 'talks', displayName: 'Talks', sectionType: 'itemList' }],
      customSections: {
        talks: {
          sectionType: 'itemList',
          items: [{ id: 1, title: 'GraphQL at scale', description: ['Covered Terraform'] }],
        },
        notes: { sectionType: 'text', text: 'Uses Kafka daily' },
        tools: { sectionType: 'stringList', strings: ['Docker'] },
      },
    } as unknown as ResumeData;
    const keywords = ['Rust', 'Kubernetes', 'GraphQL', 'Terraform', 'Kafka', 'Docker'];

    const { container, getByText } = render(
      <HighlightedResumeView resumeData={data} keywords={keywords} />
    );

    const marked = [...container.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marked).toEqual(['Rust', 'Kubernetes', 'GraphQL', 'Terraform', 'Kafka']);
    // A string-list entry containing a keyword is highlighted as a whole tag.
    expect(getByText('Docker')).toHaveClass('bg-highlight');
    // Custom sections are titled with the user's section name.
    expect(getByText('Talks')).toBeInTheDocument();
  });
});
