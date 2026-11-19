import { describe, expect, it } from 'vitest';
import {
  experienceRegenerateItems,
  projectRegenerateItems,
  skillsRegenerateItem,
} from '@/lib/builder/regenerate-items';

describe('regenerate wizard items', () => {
  it('numbers experience entries exp_N in resume order', () => {
    expect(
      experienceRegenerateItems([
        { id: 1, title: 'Engineer', company: 'Acme', description: ['Built APIs'] },
        { id: 2, title: '', company: '', description: 'not a list' as never },
      ] as never)
    ).toEqual([
      {
        item_id: 'exp_0',
        item_type: 'experience',
        title: 'Engineer',
        subtitle: 'Acme',
        current_content: ['Built APIs'],
      },
      {
        item_id: 'exp_1',
        item_type: 'experience',
        title: '',
        subtitle: undefined,
        current_content: [],
      },
    ]);
  });

  it('numbers projects proj_N with the role as subtitle', () => {
    expect(
      projectRegenerateItems([
        { id: 1, name: 'CLI', role: 'Author', description: ['Shipped'] },
      ] as never)
    ).toEqual([
      {
        item_id: 'proj_0',
        item_type: 'project',
        title: 'CLI',
        subtitle: 'Author',
        current_content: ['Shipped'],
      },
    ]);
  });

  it.each([
    [undefined, []],
    [[], []],
  ])('has no items for missing or empty sections (%s)', (section, expected) => {
    expect(experienceRegenerateItems(section as never)).toEqual(expected);
    expect(projectRegenerateItems(section as never)).toEqual(expected);
  });

  it('offers skills only when there are some', () => {
    expect(skillsRegenerateItem(['Go', 'SQL'], 'Skills')).toEqual({
      item_id: 'skills',
      item_type: 'skills',
      title: 'Skills',
      current_content: ['Go', 'SQL'],
    });
    expect(skillsRegenerateItem([], 'Skills')).toBeNull();
    expect(skillsRegenerateItem(undefined, 'Skills')).toBeNull();
  });
});
