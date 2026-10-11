import { describe, expect, it } from 'vitest';

import type { ResumeData } from '@/components/dashboard/resume-component';
import { normalizeResumeForRender, normalizeResumeForSave } from '@/lib/utils/resume-normalization';

const baseResume = {
  personalInfo: {
    name: 'Ada Lovelace',
    title: 'Software Engineer',
    email: 'ada@example.com',
  },
  summary: '',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
} satisfies ResumeData;

describe('resume normalization', () => {
  it('drops empty description placeholders from the canonical save payload', () => {
    const editorState: ResumeData = {
      ...baseResume,
      workExperience: [
        {
          id: 1,
          title: 'Engineer',
          company: 'Analytical Engines Inc',
          years: '2024 - Present',
          description: ['', 'Built reliable systems', '   '],
        },
      ],
    };

    expect(normalizeResumeForSave(editorState).workExperience?.[0]).toMatchObject({
      description: ['Built reliable systems'],
    });
    expect(editorState.workExperience?.[0].description).toEqual([
      '',
      'Built reliable systems',
      '   ',
    ]);
  });

  it('drops entirely empty editor-only experience entries from the save payload', () => {
    const editorState: ResumeData = {
      ...baseResume,
      workExperience: [
        {
          id: 1,
          title: '',
          company: '',
          location: '',
          years: '',
          description: [''],
        },
      ],
    };

    expect(normalizeResumeForSave(editorState).workExperience).toEqual([]);
  });

  it('normalizes custom item-list sections for rendering and saving', () => {
    const editorState: ResumeData = {
      ...baseResume,
      customSections: {
        custom_1: {
          sectionType: 'itemList',
          items: [
            {
              id: 1,
              title: 'Publication',
              description: ['', 'Accepted at a systems workshop'],
            },
          ],
        },
      },
    };

    const normalized = normalizeResumeForRender(editorState);

    expect(normalized.customSections?.custom_1.items?.[0].description).toEqual([
      'Accepted at a systems workshop',
    ]);
  });

  it('ignores malformed persisted list and description values during normalization', () => {
    const malformedState = {
      ...baseResume,
      workExperience: [
        {
          id: 1,
          title: 'Engineer',
          company: 'Analytical Engines Inc',
          years: '2024 - Present',
          description: 'not-an-array',
        },
      ],
      additional: {
        technicalSkills: ['TypeScript', null, '  '],
        languages: 'not-an-array',
      },
    } as unknown as ResumeData;

    const normalized = normalizeResumeForSave(malformedState);

    expect(normalized.workExperience?.[0].description).toEqual([]);
    expect(normalized.additional?.technicalSkills).toEqual(['TypeScript']);
    expect(normalized.additional?.languages).toEqual([]);
  });

  it('keeps descriptionStyles aligned when blank description points are dropped', () => {
    const editorState: ResumeData = {
      ...baseResume,
      workExperience: [
        {
          id: 1,
          title: 'Engineer',
          company: 'Analytical Engines Inc',
          years: '2024 - Present',
          description: ['', 'Led the migration', 'Cut costs 40%'],
          descriptionStyles: ['bullet', 'plain', 'bullet'],
        },
      ],
    };

    const normalized = normalizeResumeForSave(editorState);
    const experience = normalized.workExperience?.[0];

    // The blank first point is dropped, so its style must be dropped with it —
    // otherwise 'Led the migration' inherits 'bullet' and 'Cut costs 40%'
    // inherits 'plain', silently flipping both.
    expect(experience?.description).toEqual(['Led the migration', 'Cut costs 40%']);
    expect(experience?.descriptionStyles).toEqual(['plain', 'bullet']);
  });

  it('leaves items without descriptionStyles untouched', () => {
    const editorState: ResumeData = {
      ...baseResume,
      workExperience: [
        {
          id: 1,
          title: 'Engineer',
          company: 'Analytical Engines Inc',
          years: '2024 - Present',
          description: ['', 'Shipped it'],
        },
      ],
    };

    const experience = normalizeResumeForSave(editorState).workExperience?.[0];

    expect(experience?.description).toEqual(['Shipped it']);
    expect(experience).not.toHaveProperty('descriptionStyles');
  });
});

describe('normalization robustness against malformed persisted data', () => {
  // These inputs are not reachable from the editor, but they ARE reachable from
  // hand-edited localStorage or a legacy server row, and each one used to throw
  // or leak a bad value into the canonical PATCH payload.
  const malformed = (over: Record<string, unknown>): ResumeData =>
    ({ ...baseResume, ...over }) as unknown as ResumeData;

  it('coerces a null string list to [] instead of leaking null', () => {
    const out = normalizeResumeForSave(
      malformed({ additional: { technicalSkills: null, languages: undefined } })
    );

    expect(out.additional?.technicalSkills).toEqual([]);
    // `undefined` still means "absent" and is preserved.
    expect(out.additional?.languages).toBeUndefined();
  });

  it('does not throw on non-string scalar fields', () => {
    expect(() =>
      normalizeResumeForSave(
        malformed({ workExperience: [{ id: 1, title: 5, description: ['ok'] }] })
      )
    ).not.toThrow();
  });

  it('does not throw on a non-array description', () => {
    expect(() =>
      normalizeResumeForSave(
        malformed({ personalProjects: [{ id: 1, name: 'P', description: 'not-an-array' }] })
      )
    ).not.toThrow();
  });

  it('does not throw on a non-array custom itemList', () => {
    expect(() =>
      normalizeResumeForSave(
        malformed({
          customSections: { custom_1: { sectionType: 'itemList', items: { bogus: true } } },
        })
      )
    ).not.toThrow();
  });

  it('does not throw when top-level collections are not arrays', () => {
    expect(() =>
      normalizeResumeForSave(malformed({ workExperience: null, personalProjects: 'nope' }))
    ).not.toThrow();
  });
});

describe('normalization robustness — element level', () => {
  const malformed = (over: Record<string, unknown>): ResumeData =>
    ({ ...baseResume, ...over }) as unknown as ResumeData;

  it('drops null and primitive entries inside otherwise-valid arrays', () => {
    // Container guards were not enough: a null element throws on property
    // access inside normalizeDescriptionFields.
    const out = normalizeResumeForSave(
      malformed({
        workExperience: [null, { id: 1, title: 'Engineer' }, 'nope', undefined],
        personalProjects: [null, { id: 2, name: 'Proj' }],
      })
    );

    expect(out.workExperience).toHaveLength(1);
    expect(out.workExperience?.[0].title).toBe('Engineer');
    expect(out.personalProjects).toHaveLength(1);
  });

  it('drops null entries inside a custom itemList', () => {
    const out = normalizeResumeForSave(
      malformed({
        customSections: {
          custom_1: { sectionType: 'itemList', items: [null, { id: 1, title: 'C' }] },
        },
      })
    );

    expect(out.customSections?.custom_1.items).toHaveLength(1);
  });
});

describe('normalization robustness — sections and education', () => {
  const malformed = (over: Record<string, unknown>): ResumeData =>
    ({ ...baseResume, ...over }) as unknown as ResumeData;

  it('does not throw on a null customSections entry', () => {
    expect(() =>
      normalizeResumeForSave(malformed({ customSections: { broken: null, ok: undefined } }))
    ).not.toThrow();
  });

  it('drops null and primitive customSections entries from the save payload', () => {
    const out = normalizeResumeForSave(
      malformed({
        customSections: {
          broken: null,
          primitive: 'nope',
          array: ['not', 'a', 'section'],
          ok: { sectionType: 'stringList', strings: ['Real'] },
        },
      })
    );

    // Invalid entries must not reach the backend (CustomSection validation
    // fails on them) nor crash consumers doing Object.entries -> .sectionType.
    expect(out.customSections?.broken).toBeUndefined();
    expect(out.customSections?.primitive).toBeUndefined();
    expect(out.customSections?.array).toBeUndefined();
    expect(out.customSections?.ok).toEqual({ sectionType: 'stringList', strings: ['Real'] });
  });

  it('drops customSections entries whose sectionType is missing', () => {
    const out = normalizeResumeForSave(
      malformed({
        customSections: {
          noType: { foo: 'bar' },
          empty: {},
          ok: { sectionType: 'itemList', items: [{ id: 1, title: 'Real' }] },
        },
      })
    );

    expect(out.customSections?.noType).toBeUndefined();
    expect(out.customSections?.empty).toBeUndefined();
    expect(out.customSections?.ok).toEqual({
      sectionType: 'itemList',
      items: [{ id: 1, title: 'Real', description: [] }],
    });
  });

  it('drops customSections entries with an invalid sectionType', () => {
    const out = normalizeResumeForSave(
      malformed({
        customSections: {
          bogus: { sectionType: 'bogus', items: [] },
          ok: { sectionType: 'stringList', strings: ['Real'] },
        },
      })
    );

    expect(out.customSections?.bogus).toBeUndefined();
    expect(out.customSections?.ok).toEqual({ sectionType: 'stringList', strings: ['Real'] });
  });

  it('keeps every SectionType union member with content intact', () => {
    const out = normalizeResumeForSave(
      malformed({
        customSections: {
          info: { sectionType: 'personalInfo', text: 'Header' },
          text: { sectionType: 'text', text: 'Body' },
          item: {
            sectionType: 'itemList',
            items: [{ id: 1, title: 'A', description: ['', 'Kept'] }],
          },
          list: { sectionType: 'stringList', strings: ['One', '  Two  '] },
        },
      })
    );

    expect(out.customSections?.info).toEqual({ sectionType: 'personalInfo', text: 'Header' });
    expect(out.customSections?.text).toEqual({ sectionType: 'text', text: 'Body' });
    expect(out.customSections?.item).toEqual({
      sectionType: 'itemList',
      items: [{ id: 1, title: 'A', description: ['Kept'] }],
    });
    expect(out.customSections?.list).toEqual({
      sectionType: 'stringList',
      strings: ['One', 'Two'],
    });
  });

  it('drops null and primitive education entries', () => {
    const out = normalizeResumeForSave(
      malformed({ education: [null, { id: 1, institution: 'MIT' }, 'nope'] })
    );

    expect(out.education).toHaveLength(1);
    expect(out.education?.[0].institution).toBe('MIT');
  });

  it('does not throw when education is not an array', () => {
    expect(() => normalizeResumeForSave(malformed({ education: null }))).not.toThrow();
  });
});
