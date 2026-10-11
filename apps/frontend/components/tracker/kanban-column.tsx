'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence, FadeItem } from '@/components/common/presence';
import { EmptyState } from '@/components/ui/empty-state';
import { PanelHeader } from '@/components/ui/panel-header';
import { useTranslations } from '@/lib/i18n';
import type { Application, ApplicationStatus } from '@/lib/api/tracker';
import { ApplicationCard } from './application-card';

interface KanbanColumnProps {
  status: ApplicationStatus;
  applications: Application[];
  selectedIds: Set<string>;
  sharedResumeIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

export function KanbanColumn({
  status,
  applications,
  selectedIds,
  sharedResumeIds,
  onToggleSelect,
  onOpen,
}: KanbanColumnProps) {
  const { t } = useTranslations();
  // Droppable wrapper so EMPTY columns still accept a dropped card. The id is
  // namespaced ("column:<status>") to disambiguate from card ids.
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });

  return (
    <div className="flex h-full w-80 shrink-0 flex-col p-3">
      <PanelHeader tone="neutral" level="h2" title={t(`tracker.columns.${status}`)}>
        <span className="font-mono text-xs text-steel tabular-nums">{applications.length}</span>
      </PanelHeader>

      <SortableContext
        items={applications.map((a) => a.application_id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1 transition-colors ${isOver ? 'bg-paper' : ''}`}
        >
          {applications.length === 0 && (
            <EmptyState variant="framed" title={t('tracker.columns.empty')} />
          )}
          {/* Cards fade in and out; the dnd-kit node stays inside FadeItem
              because dnd-kit owns `transform` on its own element. */}
          <AnimatePresence initial={false}>
            {applications.map((application) => (
              <FadeItem key={application.application_id}>
                <ApplicationCard
                  application={application}
                  selected={selectedIds.has(application.application_id)}
                  sharedResume={
                    application.master_resume_id !== null &&
                    sharedResumeIds.has(application.master_resume_id)
                  }
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                />
              </FadeItem>
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>
    </div>
  );
}
