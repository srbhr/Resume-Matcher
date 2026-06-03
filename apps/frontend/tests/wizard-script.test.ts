import { describe, expect, it } from 'vitest';
import {
  emptyWizardData,
  appendDraft,
  assembleResume,
  canFinish,
  summarizeFragment,
  type WizardData,
} from '@/components/create/wizard-script';

describe('wizard-script', () => {
  it('starts empty and cannot finish', () => {
    const d = emptyWizardData();
    expect(canFinish(d)).toBe(false);
  });

  it('canFinish requires a name AND at least one content section', () => {
    let d: WizardData = { ...emptyWizardData(), name: 'James' };
    expect(canFinish(d)).toBe(false); // name only
    d = appendDraft(d, 'skills', { technicalSkills: ['Python'] });
    expect(canFinish(d)).toBe(true);
  });

  it('appendDraft assigns sequential ids to work entries', () => {
    let d = { ...emptyWizardData(), name: 'James' };
    d = appendDraft(d, 'work', { title: 'Eng', company: 'A', years: '2020', description: ['x'] });
    d = appendDraft(d, 'work', { title: 'Eng2', company: 'B', years: '2021', description: ['y'] });
    expect(d.workExperience.map((e) => e.id)).toEqual([1, 2]);
    expect(d.workExperience[1].company).toBe('B');
  });

  it('appendDraft skills merges repeated drafts and dedupes (case-insensitive)', () => {
    let d = emptyWizardData();
    d = appendDraft(d, 'skills', { technicalSkills: ['Python', 'AWS'] });
    expect(d.technicalSkills).toEqual(['Python', 'AWS']);
    // A second Skills pass appends rather than overwrites; dupes are dropped.
    d = appendDraft(d, 'skills', { technicalSkills: ['aws', 'Docker'] });
    expect(d.technicalSkills).toEqual(['Python', 'AWS', 'Docker']);
  });

  it('summarizeFragment renders a short chat confirmation per section', () => {
    expect(summarizeFragment('work', { title: 'Engineer', company: 'Google' })).toBe(
      'Engineer · Google'
    );
    expect(summarizeFragment('education', { degree: 'BS CS', institution: 'MIT' })).toBe(
      'BS CS · MIT'
    );
    expect(summarizeFragment('project', { name: 'CLI Tool' })).toBe('CLI Tool');
    expect(summarizeFragment('skills', { technicalSkills: ['Python', 'AWS'] })).toBe('Python, AWS');
  });

  it('appendDraft summary sets summary text', () => {
    let d = emptyWizardData();
    d = appendDraft(d, 'summary', { summary: 'A backend engineer.' });
    expect(d.summary).toBe('A backend engineer.');
  });

  it('assembleResume maps into ProcessedResume shape', () => {
    let d: WizardData = {
      ...emptyWizardData(),
      name: 'James Carter',
      role: 'Backend Engineer',
      contact: { email: 'j@x.com', location: 'NYC' },
    };
    d = appendDraft(d, 'work', {
      title: 'Eng',
      company: 'Google',
      years: '2022',
      description: ['Built X'],
    });
    const resume = assembleResume(d);
    expect(resume.personalInfo?.name).toBe('James Carter');
    expect(resume.personalInfo?.title).toBe('Backend Engineer');
    expect(resume.personalInfo?.email).toBe('j@x.com');
    expect(resume.workExperience?.[0].company).toBe('Google');
    expect(resume.workExperience?.[0].id).toBe(1);
  });
});
