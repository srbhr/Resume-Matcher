import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import Resume, { type ResumeData, type SectionMeta } from '@/components/dashboard/resume-component';
import { TEMPLATE_OPTIONS } from '@/lib/types/template-settings';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

const meta = (id: string, order: number, patch: Partial<SectionMeta> = {}): SectionMeta => ({
  id,
  key: id,
  displayName: id,
  sectionType: 'itemList',
  isDefault: !id.startsWith('custom_'),
  isVisible: true,
  order,
  ...patch,
});

const data: ResumeData = {
  personalInfo: { name: 'Sarah Chen', email: 'sarah@example.com', github: 'github.com/sarah' },
  summary: 'Builds retrieval pipelines.',
  workExperience: [
    {
      id: 1,
      title: 'Staff Engineer',
      company: 'Fernway',
      years: '2020 - 2023',
      description: ['Long one.', 'Two.', 'Three.', 'Four.'],
    },
    { id: 2, title: 'Engineer', company: 'Lumen', years: '2017 - 2020', description: ['Short.'] },
  ],
  education: [{ id: 1, institution: 'Uni Berlin', degree: 'BSc Physics', years: '2012 - 2016' }],
  personalProjects: [{ id: 1, name: 'promptdiff', description: ['A prompt test runner.'] }],
  additional: { technicalSkills: ['Python', 'Go'], awards: ['Best paper (2019)'] },
  sectionMeta: [
    meta('personalInfo', 0, { sectionType: 'personalInfo' }),
    meta('summary', 1, { sectionType: 'text', displayName: 'Summary' }),
    meta('workExperience', 2, { displayName: 'Experience' }),
    meta('education', 3, { displayName: 'Education' }),
    meta('personalProjects', 4, { displayName: 'Projects' }),
    meta('additional', 5, { sectionType: 'stringList', displayName: 'Skills' }),
    meta('custom_1', 6, { displayName: 'Volunteering' }),
  ],
  customSections: {
    custom_1: {
      sectionType: 'itemList',
      items: [{ id: 1, title: 'Mentor', subtitle: 'Code Club', years: '2021', description: [] }],
    },
  },
};

describe.each(TEMPLATE_OPTIONS.map((option) => option.id))(
  'page-break hooks in the %s template',
  (template) => {
    it('marks every heading, inside a marked section', () => {
      const { container } = render(<Resume resumeData={data} template={template} />);
      const headings = Array.from(container.querySelectorAll('h3'));
      expect(headings.length).toBeGreaterThan(3);
      for (const heading of headings) {
        expect(heading).toHaveAttribute('data-resume-section-title');
        expect(heading.closest('[data-resume-section]')).not.toBeNull();
      }
    });

    it('marks entries, and lets only the four-bullet one split', () => {
      const { container } = render(<Resume resumeData={data} template={template} />);
      const entry = (text: string) =>
        Array.from(container.querySelectorAll('[data-resume-item]')).find((el) =>
          el.textContent?.includes(text)
        );
      expect(entry('Fernway')).toHaveAttribute('data-resume-item', 'split');
      expect(entry('Lumen')).toHaveAttribute('data-resume-item', '');
      expect(entry('Uni Berlin')).toHaveAttribute('data-resume-item', '');
      expect(entry('promptdiff')).toHaveAttribute('data-resume-item', '');
      expect(entry('Code Club')).toHaveAttribute('data-resume-item', '');
      expect(container.querySelectorAll('[data-resume-item="split"]')).toHaveLength(1);
    });
  }
);
