/** Minimum shape a list item needs to participate in drag-and-drop reordering. */
export interface ReorderableItem {
  id: number;
}

/**
 * Move the item identified by `activeId` to the position of `overId`.
 *
 * Returns `null` — rather than a copy of the input — whenever the drag was a
 * no-op (dropped outside a target, dropped on itself, or referencing an id that
 * is no longer in the list). Callers use that to skip the state update entirely,
 * so an aborted drag cannot mark the resume dirty or trigger an autosave.
 *
 * Deliberately dependency-free: no React, and no @dnd-kit. That keeps the
 * reorder rules unit-testable without mounting a DndContext, and keeps them
 * intact if the drag library is swapped or lazy-loaded. The move itself matches
 * `arrayMove` semantics for the non-negative indices `findIndex` can return.
 */
export function reorderById<T extends ReorderableItem>(
  items: T[],
  activeId: number | string,
  overId: number | string | null | undefined
): T[] | null {
  if (overId === null || overId === undefined) return null;
  if (activeId === overId) return null;

  const oldIndex = items.findIndex((item) => item.id === activeId);
  const newIndex = items.findIndex((item) => item.id === overId);
  if (oldIndex === -1 || newIndex === -1) return null;

  const reordered = items.slice();
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  return reordered;
}

/**
 * Insert a deep copy of the item identified by `id` directly below it.
 *
 * The copy gets the next free id (`max + 1`, the same rule the "add" buttons
 * use). An unknown id returns `items` itself, so callers can tell nothing
 * happened by reference and skip the update.
 */
export function duplicateById<T extends ReorderableItem>(items: T[], id: number): T[] {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return items;

  const copy: T = {
    ...structuredClone(items[index]),
    id: Math.max(...items.map((item) => item.id), 0) + 1,
  };
  const duplicated = items.slice();
  duplicated.splice(index + 1, 0, copy);
  return duplicated;
}
