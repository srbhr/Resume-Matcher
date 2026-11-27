'use client';

import './ui-sdk.css';
import type { ReactNode } from 'react';
import { Resizable, ResizableHandle, ResizablePanel } from '@ui-sdk/react/resizable';

interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  /** The handle's accessible name, like "Resize editor and preview". */
  handleLabel: string;
  /** Saves the split in the browser under this key and restores it next visit. */
  autoSaveId: string;
}

/**
 * Two panes side by side with a draggable ink rule between them: ui-sdk's
 * Resizable. Drag the rule, or focus it and use the arrow keys (Shift for
 * bigger steps). Each pane keeps at least 30% of the width.
 */
export function ResizableSplit({ left, right, handleLabel, autoSaveId }: ResizableSplitProps) {
  return (
    <Resizable autoSaveId={autoSaveId} className="flex min-h-0 flex-1">
      <ResizablePanel
        id={`${autoSaveId}-left`}
        defaultSize={50}
        minSize={30}
        className="grid min-h-0 overflow-hidden p-0"
      >
        {left}
      </ResizablePanel>
      <ResizableHandle
        aria-label={handleLabel}
        // 1px ink rule, like the grid gap it replaces, with a wider hit area.
        className="relative w-px shrink-0 bg-ink before:absolute before:inset-y-0 before:-left-1 before:-right-1 hover:bg-primary focus-visible:bg-primary focus-visible:outline-none data-[dragging]:bg-primary"
      />
      <ResizablePanel
        id={`${autoSaveId}-right`}
        minSize={30}
        className="grid min-h-0 overflow-hidden p-0"
      >
        {right}
      </ResizablePanel>
    </Resizable>
  );
}
