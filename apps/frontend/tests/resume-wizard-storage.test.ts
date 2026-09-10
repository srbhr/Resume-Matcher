import { afterEach, expect, it } from 'vitest';
import { readResumeWizardDraft } from '@/lib/utils/resume-wizard-storage';

afterEach(() => localStorage.clear());
it('retains numeric dates and pairs description styles with their source rows', () => {
  localStorage.setItem(
    'resume_wizard_draft',
    JSON.stringify({
      step: 'question',
      asked_count: 2,
      progress: { current: 8, total: 10 },
      resume_data: {
        workExperience: [
          {
            years: 2024,
            description: ['', null, 'Plain row', 'Bullet row'],
            descriptionStyles: ['bullet', 'bullet', 'plain', 'bullet'],
          },
        ],
        personalProjects: [{ years: 2023 }],
        education: [{ years: 2022 }],
        customSections: {
          awards: {
            sectionType: 'itemList',
            items: [
              {
                years: 2021,
                description: [null, 'Plain award'],
                descriptionStyles: ['bullet', 'plain'],
              },
            ],
          },
        },
      },
    })
  );
  const restored = readResumeWizardDraft();
  expect(restored?.progress.current).toBe(2);
  expect(restored?.resume_data.workExperience?.[0]).toMatchObject({
    years: '2024',
    description: ['Plain row', 'Bullet row'],
    descriptionStyles: ['plain', 'bullet'],
  });
  expect(restored?.resume_data.personalProjects?.[0].years).toBe('2023');
  expect(restored?.resume_data.education?.[0].years).toBe('2022');
  expect(restored?.resume_data.customSections?.awards.items?.[0]).toMatchObject({
    years: '2021',
    description: ['Plain award'],
    descriptionStyles: ['plain'],
  });
});
