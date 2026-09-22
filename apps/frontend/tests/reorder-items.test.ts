import { describe, it, expect } from 'vitest';
import { reorderById } from '@/lib/utils/reorder-items';

/**
 * Item-level reorder rules for the builder's list sections (experience,
 * education, projects, custom item-list sections).
 *
 * `reorderById` returns null for every no-op drag so callers can skip the state
 * update — an aborted drag must not dirty the resume or trigger an autosave.
 */

interface Row {
  id: number;
  name: string;
}

const rows: Row[] = [
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
  { id: 3, name: 'c' },
  { id: 4, name: 'd' },
];

const names = (items: Row[] | null) => items?.map((i) => i.name);

describe('reorderById', () => {
  it('moves an item down to the drop target position', () => {
    expect(names(reorderById(rows, 1, 3))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item up to the drop target position', () => {
    expect(names(reorderById(rows, 4, 2))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves the last item to the front', () => {
    expect(names(reorderById(rows, 4, 1))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const original = [...rows];
    reorderById(rows, 1, 4);
    expect(rows).toEqual(original);
  });

  it('returns null when dropped on itself', () => {
    expect(reorderById(rows, 2, 2)).toBeNull();
  });

  it('returns null when dropped outside any target', () => {
    // @dnd-kit reports `over: null`, so callers pass undefined/null through.
    expect(reorderById(rows, 2, undefined)).toBeNull();
    expect(reorderById(rows, 2, null)).toBeNull();
  });

  it('returns null when an id is not in the list', () => {
    expect(reorderById(rows, 99, 2)).toBeNull();
    expect(reorderById(rows, 2, 99)).toBeNull();
  });

  it('handles single-item and empty lists without throwing', () => {
    expect(reorderById([{ id: 1, name: 'a' }], 1, 1)).toBeNull();
    expect(reorderById([] as Row[], 1, 2)).toBeNull();
  });

  it('preserves the full item object, not just its id', () => {
    const reordered = reorderById(rows, 1, 2);
    expect(reordered?.[1]).toEqual({ id: 1, name: 'a' });
  });
});
