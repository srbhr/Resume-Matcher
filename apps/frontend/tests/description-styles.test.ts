import { describe, expect, it } from 'vitest';

import { alignDescriptionStyles, toggleDescriptionStyle } from '@/lib/utils/description-styles';

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
