'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface DraggableSectionWrapperProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}

/**
 * DraggableSectionWrapper Component
 *
 * Wraps resume sections to make them draggable using @dnd-kit.
 * Provides:
 * - Drag handle (grip icon) for initiating drag operations
 * - Visual feedback during drag (opacity, cursor)
 * - Keyboard accessibility for drag operations
 * - Swiss International Style aesthetic (square corners, high contrast)
 */
export const DraggableSectionWrapper: React.FC<DraggableSectionWrapperProps> = ({
  id,
  children,
  disabled = false,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag Handle */}
      {!disabled && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 h-full w-8 flex items-start justify-center pt-6 cursor-grab active:cursor-grabbing z-10"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors" />
        </div>
      )}

      {/* Section Content - add left padding to make room for drag handle */}
      <div className={!disabled ? 'pl-8' : ''}>{children}</div>
    </div>
  );
};
