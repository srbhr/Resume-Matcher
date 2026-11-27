'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReducedMotion } from 'motion/react';
import { DotsSixVertical } from '@phosphor-icons/react';

interface DraggableListItemProps {
  id: number;
  /**
   * The row. As a function it receives the drag handle to place itself (an
   * entry's header row); otherwise the handle sits in a strip at the left.
   */
  children: React.ReactNode | ((handle: React.ReactNode) => React.ReactNode);
  /** Accessible name for the drag handle. */
  handleLabel?: string;
}

/**
 * DraggableListItem Component
 *
 * Generic wrapper for list items (experience, education, projects, etc.) to make them draggable using @dnd-kit.
 * Provides:
 * - Drag handle (grip icon) for initiating drag operations
 * - Visual feedback during drag (opacity, cursor)
 * - Keyboard accessibility for drag operations
 * - Swiss International Style aesthetic (square corners, high contrast)
 */
export const DraggableListItem: React.FC<DraggableListItemProps> = ({
  id,
  children,
  handleLabel = 'Drag to reorder',
}) => {
  const reducedMotion = useReducedMotion();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: reducedMotion ? null : { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (typeof children === 'function') {
    const handle = (
      <div
        {...attributes}
        {...listeners}
        className="flex size-8 shrink-0 cursor-grab items-center justify-center text-steel transition-colors hover:text-ink active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        title={handleLabel}
        aria-label={handleLabel}
      >
        <DotsSixVertical aria-hidden="true" className="size-4" />
      </div>
    );
    return (
      <div ref={setNodeRef} style={style}>
        {children(handle)}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 h-full w-4 flex items-start justify-center cursor-grab active:cursor-grabbing z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary before:absolute before:inset-y-0 before:-inset-x-1 before:content-['']"
        title={handleLabel}
        aria-label={handleLabel}
      >
        <DotsSixVertical
          aria-hidden="true"
          className="size-4 text-steel hover:text-ink-soft transition-colors"
        />
      </div>

      {/* List Item Content - add left padding to make room for drag handle */}
      <div className="pl-4">{children}</div>
    </div>
  );
};
