import { describe, expect, it } from 'vitest';

import {
  alignDescriptionStyles,
  fromDescriptionRows,
  toDescriptionRows,
  toggleDescriptionStyle,
} from '@/lib/utils/description-styles';
import { reorderById } from '@/lib/utils/reorder-items';

describe('description style helpers', () => {
  it('aligns missing and sparse description styles to bullet defaults', () => {
    expect(alignDescriptionStyles(['A', 'B', 'C'], undefined)).toEqual([
      'bullet',
      'bullet',
      'bullet',
    ]);
    expect(alignDescriptionStyles(['A', 'B', 'C'], [undefined, null, 'plain'])).toEqual([
      'bullet',
      'bullet',
      'plain',
    ]);
  });

  it('toggles after aligning styles so old resumes do not create sparse arrays', () => {
    expect(toggleDescriptionStyle(['A', 'B', 'C'], undefined, 2)).toEqual([
      'bullet',
      'bullet',
      'plain',
    ]);
    expect(toggleDescriptionStyle(['A', 'B', 'C'], ['bullet', 'plain'], 1)).toEqual([
      'bullet',
      'bullet',
      'bullet',
    ]);
  });
});

describe('description point rows', () => {
  it('pairs each point with its aligned style, keyed by position', () => {
    expect(toDescriptionRows(['A', 'B'], ['plain'])).toEqual([
      { id: 0, text: 'A', style: 'plain' },
      { id: 1, text: 'B', style: 'bullet' },
    ]);
    expect(toDescriptionRows(undefined, undefined)).toEqual([]);
  });

  it('moves a point together with its style when reordered', () => {
    // 'C' is the plain one; after moving it to the front it must stay plain and
    // the others must stay bullets — a mismatch here restyles the wrong point.
    const rows = toDescriptionRows(['A', 'B', 'C'], ['bullet', 'bullet', 'plain']);
    const moved = reorderById(rows, 2, 0);

    expect(moved).not.toBeNull();
    expect(fromDescriptionRows(moved!)).toEqual({
      description: ['C', 'A', 'B'],
      descriptionStyles: ['plain', 'bullet', 'bullet'],
    });
  });

  it('round-trips without reordering', () => {
    expect(fromDescriptionRows(toDescriptionRows(['A', 'B'], ['plain', 'bullet']))).toEqual({
      description: ['A', 'B'],
      descriptionStyles: ['plain', 'bullet'],
    });
  });
});
