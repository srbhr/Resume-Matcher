import { describe, expect, it } from 'vitest';
import type { ResumeListItem } from '@/lib/api/resume';
import { visibleTailored } from '@/lib/dashboard/tailored-list';

const row = (id: string, parent: string, title: string, updated: string) =>
  ({
    resume_id: id,
    parent_id: parent,
    title,
    updated_at: updated,
    created_at: '2026-01-01T00:00:00Z',
  }) as ResumeListItem;

const resumes = [
  row('a', 'm1', 'Zeta role', '2026-11-01T00:00:00Z'),
  row('b', 'm2', 'alpha role', '2026-11-03T00:00:00Z'),
  row('c', 'm1', 'Émile role', '2026-11-02T00:00:00Z'),
];
const titleOf = (r: ResumeListItem) => r.title ?? '';
const ids = (list: ResumeListItem[]) => list.map((r) => r.resume_id);

describe('visibleTailored', () => {
  it('shows every master’s resumes, most recently edited first', () => {
    expect(
      ids(visibleTailored(resumes, { master: 'all', sort: 'recent', titleOf, locale: 'en' }))
    ).toEqual(['b', 'c', 'a']);
  });

  it('sorts A to Z in the UI locale, ignoring case and accents as people read', () => {
    expect(
      ids(visibleTailored(resumes, { master: 'all', sort: 'name', titleOf, locale: 'en' }))
    ).toEqual(['b', 'c', 'a']);
  });

  it('keeps one master’s resumes only', () => {
    expect(
      ids(visibleTailored(resumes, { master: 'm1', sort: 'recent', titleOf, locale: 'en' }))
    ).toEqual(['c', 'a']);
  });

  it('falls back to the creation date when a resume was never edited', () => {
    const never = { ...row('d', 'm1', 'Never', ''), created_at: '2026-11-04T00:00:00Z' };
    expect(
      ids(
        visibleTailored([...resumes, never], {
          master: 'all',
          sort: 'recent',
          titleOf,
          locale: 'en',
        })
      )[0]
    ).toBe('d');
  });

  it('leaves the list it was given as it was', () => {
    const before = ids(resumes);
    visibleTailored(resumes, { master: 'all', sort: 'name', titleOf, locale: 'en' });
    expect(ids(resumes)).toEqual(before);
  });
});
