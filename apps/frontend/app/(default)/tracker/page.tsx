import React from 'react';
import { PageFrame } from '@/components/ui/page-frame';
import { KanbanBoard } from '@/components/tracker/kanban-board';

export default function TrackerPage() {
  return (
    // Fill the viewport so the Swiss canvas grows with the window; the board
    // area flexes to the frame's height and the columns scroll internally.
    <PageFrame width="wide" height="screen" className="h-full">
      <KanbanBoard />
    </PageFrame>
  );
}
