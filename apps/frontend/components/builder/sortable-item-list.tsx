'use client';

import React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { DraggableListItem } from './draggable-list-item';
import { reorderById, type ReorderableItem } from '@/lib/utils/reorder-items';

interface SortableItemListProps<T extends ReorderableItem> {
  /**
   * Stable, unique DndContext id. Required: an auto-generated id differs between
   * the server and client renders and trips React hydration. Two sections must
   * never share one.
   */
  id: string;
  items: T[];
  onReorder: (items: T[]) => void;
  /** Spacing wrapper for the list; matches the per-section rhythm. */
  className?: string;
  /** Accessible name for each row's drag handle; omitted, DraggableListItem uses "Drag to reorder". */
  handleLabel?: string;
  /** Renders one row; `index` is the item's current position in `items`. */
  children: (item: T, index: number) => React.ReactNode;
}

/**
 * SortableItemList Component
 *
 * Item-level drag-and-drop reordering for an editor section's entries
 * (experience, education, projects, custom item-list sections).
 *
 * This wiring — sensors, DndContext, SortableContext, and the per-row
 * DraggableListItem handle — used to be copy-pasted into each section form.
 * Experience and Education each carried their own copy while Projects and
 * custom sections were simply never given one, so those two sections could not
 * be reordered at all. Owning it in one place is what keeps the next section
 * from shipping with the same gap.
 *
 * Section-level reordering is separate and lives in
 * `draggable-section-wrapper.tsx`.
 */
export function SortableItemList<T extends ReorderableItem>({
  id,
  items,
  onReorder,
  className = 'space-y-8',
  handleLabel,
  children,
}: SortableItemListProps<T>) {
  // PointerSensor covers mouse/touch; KeyboardSensor makes the handle operable
  // with the keyboard alone (WCAG 2.2 AA — the handle is focusable and exposes
  // a button role through useSortable's attributes).
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const reordered = reorderById(items, active.id, over?.id);
    // null means the drag was a no-op; skip the update so an aborted drag does
    // not dirty the resume or kick off an autosave.
    if (reordered) onReorder(reordered);
  };

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item, index) => (
            <DraggableListItem key={item.id} id={item.id} handleLabel={handleLabel}>
              {children(item, index)}
            </DraggableListItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
