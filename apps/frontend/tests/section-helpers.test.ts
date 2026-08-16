import { describe, expect, it } from 'vitest';
import type { ResumeData, SectionMeta } from '@/components/dashboard/resume-component';
import {
  DEFAULT_SECTION_META,
  createCustomSection,
  generateCustomSectionId,
  getAllSections,
  getSectionMeta,
  getSortedSections,
  localizeDefaultSectionMeta,
  withLocalizedDefaultSections,
} from '@/lib/utils/section-helpers';

/** Pure resume-section metadata logic (ordering, custom IDs, localization). */

function meta(overrides: Partial<SectionMeta>): SectionMeta {
  return {
    id: 'x',
    key: 'x',
    displayName: 'X',
    sectionType: 'text',
    isDefault: false,
    isVisible: true,
    order: 0,
    ...overrides,
  } as SectionMeta;
}

function resume(sectionMeta?: SectionMeta[]): ResumeData {
  return { sectionMeta } as unknown as ResumeData;
}

describe('getSectionMeta', () => {
  it('returns the resume sectionMeta when present', () => {
    const sm = [meta({ id: 'a' })];
    expect(getSectionMeta(resume(sm))).toBe(sm);
  });

  it('falls back to DEFAULT_SECTION_META when missing or empty', () => {
    expect(getSectionMeta(resume(undefined))).toBe(DEFAULT_SECTION_META);
    expect(getSectionMeta(resume([]))).toBe(DEFAULT_SECTION_META);
  });
});

describe('getSortedSections', () => {
  it('keeps only visible sections, sorted by order', () => {
    const sm = [
      meta({ id: 'c', order: 2, isVisible: true }),
      meta({ id: 'a', order: 0, isVisible: true }),
      meta({ id: 'hidden', order: 1, isVisible: false }),
    ];
    expect(getSortedSections(resume(sm)).map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('getAllSections', () => {
  it('includes hidden sections, sorted by order', () => {
    const sm = [
      meta({ id: 'b', order: 1, isVisible: false }),
      meta({ id: 'a', order: 0, isVisible: true }),
    ];
    expect(getAllSections(resume(sm)).map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('generateCustomSectionId', () => {
  it('starts at custom_1 when none exist', () => {
    expect(generateCustomSectionId([])).toBe('custom_1');
    expect(generateCustomSectionId([meta({ id: 'summary' })])).toBe('custom_1');
  });

  it('increments past the highest existing custom id', () => {
    const sections = [meta({ id: 'custom_1' }), meta({ id: 'custom_3' })];
    expect(generateCustomSectionId(sections)).toBe('custom_4');
  });
});

describe('createCustomSection', () => {
  it('creates a non-default visible section after the last order', () => {
    const existing = [meta({ id: 'summary', order: 5 })];
    const created = createCustomSection(existing, 'Volunteering', 'itemList');
    expect(created.id).toBe('custom_1');
    expect(created.displayName).toBe('Volunteering');
    expect(created.sectionType).toBe('itemList');
    expect(created.isDefault).toBe(false);
    expect(created.isVisible).toBe(true);
    expect(created.order).toBe(6); // maxOrder + 1
  });
});

describe('localizeDefaultSectionMeta', () => {
  const t = (key: string) => `t:${key}`;

  it('localizes a default section whose name is still the English default', () => {
    const out = localizeDefaultSectionMeta(
      [meta({ id: 'summary', displayName: 'Summary', isDefault: true })],
      t
    );
    expect(out[0].displayName).toBe('t:resume.sections.summary');
  });

  it('leaves a renamed default section untouched', () => {
    const out = localizeDefaultSectionMeta(
      [meta({ id: 'summary', displayName: 'My Story', isDefault: true })],
      t
    );
    expect(out[0].displayName).toBe('My Story');
  });

  it('leaves non-default (custom) sections untouched', () => {
    const out = localizeDefaultSectionMeta(
      [meta({ id: 'custom_1', displayName: 'Summary', isDefault: false })],
      t
    );
    expect(out[0].displayName).toBe('Summary');
  });
});

describe('withLocalizedDefaultSections', () => {
  const t = (key: string) => `t:${key}`;

  it('generates localized defaults when the resume has no sectionMeta', () => {
    const out = withLocalizedDefaultSections(resume(undefined), t);
    expect(out.sectionMeta).toHaveLength(DEFAULT_SECTION_META.length);
    const summary = out.sectionMeta!.find((s) => s.id === 'summary');
    expect(summary!.displayName).toBe('t:resume.sections.summary');
  });
});
