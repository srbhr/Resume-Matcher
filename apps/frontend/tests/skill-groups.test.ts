import { describe, expect, it } from 'vitest';
import { groupSkills, isPlainSkillList, SKILL_ROW_BREAK } from '@/lib/utils/skill-groups';

describe('groupSkills', () => {
  it('keeps a plain list as one unlabeled row, items untouched', () => {
    const rows = groupSkills(['Python', 'Java, Kotlin', '  ', 'Go']);
    expect(rows).toEqual([{ items: ['Python', 'Java, Kotlin', 'Go'] }]);
    expect(isPlainSkillList(rows)).toBe(true);
  });

  it('turns "Label: a, b" into a labeled row of separate skills', () => {
    const rows = groupSkills([
      'Molecular Biology: PCR, qPCR, RT-PCR',
      'Bioinformatics: Python, R, BLAST',
    ]);
    expect(rows).toEqual([
      { label: 'Molecular Biology', items: ['PCR', 'qPCR', 'RT-PCR'] },
      { label: 'Bioinformatics', items: ['Python', 'R', 'BLAST'] },
    ]);
    expect(isPlainSkillList(rows)).toBe(false);
  });

  it('does not split on commas inside parentheses or brackets', () => {
    const rows = groupSkills([
      'Genomics: análise filogenética (MEGA, BLAST, MrBayes), docking [AutoDock, Vina]',
    ]);
    expect(rows[0].items).toEqual([
      'análise filogenética (MEGA, BLAST, MrBayes)',
      'docking [AutoDock, Vina]',
    ]);
  });

  it('starts a new unlabeled row at each "---" (the original marker)', () => {
    const rows = groupSkills(['Python', 'R', SKILL_ROW_BREAK, 'PCR', ' --- ', 'BLAST']);
    expect(rows).toEqual([{ items: ['Python', 'R'] }, { items: ['PCR'] }, { items: ['BLAST'] }]);
    expect(isPlainSkillList(rows)).toBe(false);
  });

  it('ignores leading, trailing and repeated markers', () => {
    expect(groupSkills(['---', 'Python', '---', '---', 'Go', '---'])).toEqual([
      { items: ['Python'] },
      { items: ['Go'] },
    ]);
    expect(isPlainSkillList(groupSkills(['---', 'Python', 'Go', '---']))).toBe(true);
  });

  it('lets a bare "Label:" collect the skills on the lines below it', () => {
    const rows = groupSkills(['Microbiology:', 'Aseptic culture', 'CFU counting', '---', 'Excel']);
    expect(rows).toEqual([
      { label: 'Microbiology', items: ['Aseptic culture', 'CFU counting'] },
      { items: ['Excel'] },
    ]);
  });

  it('ends a "Label: a, b" row at its own line', () => {
    expect(groupSkills(['Python', 'Cloud: AWS, GCP', 'Docker'])).toEqual([
      { items: ['Python'] },
      { label: 'Cloud', items: ['AWS', 'GCP'] },
      { items: ['Docker'] },
    ]);
  });

  it('reads full-width CJK punctuation', () => {
    expect(groupSkills(['实验室：PCR、qPCR，RT-PCR（逆转录）', 'ラボ： 培養'])).toEqual([
      { label: '实验室', items: ['PCR', 'qPCR', 'RT-PCR（逆转录）'] },
      { label: 'ラボ', items: ['培養'] },
    ]);
  });

  it('accepts the French space before the colon', () => {
    expect(groupSkills(['Laboratoire : PCR, qPCR'])).toEqual([
      { label: 'Laboratoire', items: ['PCR', 'qPCR'] },
    ]);
  });

  it('keeps skills whose colon is not a label as plain skills', () => {
    const skills = ['ISO 9001:2015', 'https://example.com', 'A, B: C', ': nothing'];
    expect(groupSkills(skills)).toEqual([{ items: skills }]);
  });

  it('lets bare labels own the lines below them (same strings as test_skill_rows.py)', () => {
    expect(groupSkills(['Languages:', 'Python', 'Go', 'Tools:', 'Git'])).toEqual([
      { label: 'Languages', items: ['Python', 'Go'] },
      { label: 'Tools', items: ['Git'] },
    ]);
    expect(groupSkills(['实验室：', 'PCR'])).toEqual([{ label: '实验室', items: ['PCR'] }]);
  });

  it('drops a label that never gets any skills', () => {
    expect(groupSkills(['Empty:', 'Tools: Git'])).toEqual([{ label: 'Tools', items: ['Git'] }]);
  });

  it('treats an empty list as plain', () => {
    expect(groupSkills([])).toEqual([]);
    expect(isPlainSkillList([])).toBe(true);
  });
});
