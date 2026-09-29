import { describe, expect, it } from 'vitest';
import type {
  CustomSection,
  ResumeData,
  SectionMeta,
} from '@/components/dashboard/resume-component';
import { DEFAULT_SECTION_META, duplicateCustomSection } from '@/lib/utils/section-helpers';

/** Whole-section duplication for custom sections (built-in sections are excluded). */

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

const publications: CustomSection = {
  sectionType: 'itemList',
  items: [{ id: 1, title: 'Paper A', description: ['cited'] }],
};

function resume(): ResumeData {
  return {
    sectionMeta: [
      meta({ id: 'personalInfo', key: 'personalInfo', isDefault: true, order: 0 }),
      meta({
        id: 'custom_1',
        key: 'custom_1',
        displayName: 'Publications',
        sectionType: 'itemList',
        order: 1,
      }),
      meta({ id: 'summary', key: 'summary', isDefault: true, order: 2 }),
      meta({
        id: 'custom_2',
        key: 'custom_2',
        displayName: 'Awards',
        sectionType: 'stringList',
        order: 3,
      }),
    ],
    customSections: {
      custom_1: publications,
      custom_2: { sectionType: 'stringList', strings: ['Best paper'] },
    },
  } as unknown as ResumeData;
}

const byOrder = (data: ResumeData) =>
  [...(data.sectionMeta ?? [])].sort((a, b) => a.order - b.order);

describe('duplicateCustomSection', () => {
  it('puts the copy right after the source and shifts the later sections by one', () => {
    const result = duplicateCustomSection(resume(), 'custom_1', '(Copy)');

    expect(byOrder(result).map((s) => [s.id, s.order])).toEqual([
      ['personalInfo', 0],
      ['custom_1', 1],
      ['custom_3', 2],
      ['summary', 3],
      ['custom_2', 4],
    ]);
  });

  it('names the copy with the suffix and keeps type and visibility', () => {
    const input = resume();
    input.sectionMeta![1].isVisible = false;

    const result = duplicateCustomSection(input, 'custom_1', '(Copy)');
    const copy = result.sectionMeta!.find((s) => s.id === 'custom_3')!;

    expect(copy).toEqual({
      id: 'custom_3',
      key: 'custom_3',
      displayName: 'Publications (Copy)',
      sectionType: 'itemList',
      isDefault: false,
      isVisible: false,
      order: 2,
    });
  });

  it('deep-copies the section items under the new key', () => {
    const result = duplicateCustomSection(resume(), 'custom_1', '(Copy)');

    const copied = result.customSections!.custom_3;
    expect(copied).toEqual(publications);
    expect(copied).not.toBe(publications);

    copied.items![0].description![0] = 'changed';
    expect(result.customSections!.custom_1.items![0].description![0]).toBe('cited');
    expect(publications.items![0].description![0]).toBe('cited');
  });

  it('never mutates the input', () => {
    const input = resume();
    const snapshot = JSON.parse(JSON.stringify(input));

    const result = duplicateCustomSection(input, 'custom_1', '(Copy)');

    expect(result).not.toBe(input);
    expect(input).toEqual(snapshot);
  });

  it('returns the same object for a built-in section', () => {
    const input = resume();
    expect(duplicateCustomSection(input, 'summary', '(Copy)')).toBe(input);
  });

  it('returns the same object for an unknown section id', () => {
    const input = resume();
    expect(duplicateCustomSection(input, 'custom_99', '(Copy)')).toBe(input);
  });

  it('falls back to the default sections when sectionMeta is empty', () => {
    const input = { sectionMeta: [] } as unknown as ResumeData;
    // The defaults contain no custom section, so there is nothing to copy.
    expect(DEFAULT_SECTION_META.some((s) => !s.isDefault)).toBe(false);
    expect(duplicateCustomSection(input, 'custom_1', '(Copy)')).toBe(input);
  });
});
