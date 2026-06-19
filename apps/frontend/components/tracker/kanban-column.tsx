'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
      <div className="mb-2 flex items-center justify-between border-b-2 border-black pb-1">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wide text-ink">
          {t(`tracker.columns.${status}`)}
        </h2>
        <span className="font-mono text-xs text-steel-grey">{applications.length}</span>
      </div>

      <SortableContext
        items={applications.map((a) => a.application_id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-1 ${isOver ? 'bg-paper-tint' : ''}`}
        >
          {applications.length === 0 ? (
            <p className="px-2 py-6 text-center font-mono text-xs text-steel-grey">
              {t('tracker.columns.empty')}
            </p>
          ) : (
            applications.map((application) => (
              <ApplicationCard
                key={application.application_id}
                application={application}
                selected={selectedIds.has(application.application_id)}
                sharedResume={
                  application.master_resume_id !== null &&
                  sharedResumeIds.has(application.master_resume_id)
                }
                onToggleSelect={onToggleSelect}
                onOpen={onOpen}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
