'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from '@phosphor-icons/react';
import { AnimatePresence, FadeItem } from '@/components/common/presence';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PanelHeader, type PanelTone } from '@/components/ui/panel-header';
import { useTranslations } from '@/lib/i18n';
import type { Application, ApplicationStatus } from '@/lib/api/tracker';
import { ApplicationCard } from './application-card';

/** The header square says something only where the stage is an outcome. */
const STAGE_TONE: Partial<Record<ApplicationStatus, PanelTone>> = {
  accepted: 'success',
  rejected: 'destructive',
};

interface KanbanColumnProps {
  status: ApplicationStatus;
  applications: Application[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  /** Add an application straight into this stage. */
  onAdd: (status: ApplicationStatus) => void;
}

export function KanbanColumn({
  status,
  applications,
  selectedIds,
  onToggleSelect,
  onOpen,
  onAdd,
}: KanbanColumnProps) {
  const { t } = useTranslations();
  // Droppable wrapper so EMPTY columns still accept a dropped card. The id is
  // namespaced ("column:<status>") to disambiguate from card ids.
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  const stageName = t(`tracker.columns.${status}`);

  return (
    <div className="flex h-full w-full min-w-0 flex-col p-2">
      <PanelHeader tone={STAGE_TONE[status] ?? 'neutral'} level="h2" title={stageName}>
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
                  selectionActive={selectedIds.size > 0}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                />
              </FadeItem>
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 w-full shrink-0 justify-start text-ink-soft hover:text-ink"
        aria-label={t('tracker.columns.addTo', { stage: stageName })}
        onClick={() => onAdd(status)}
      >
        <Plus aria-hidden="true" />
        {t('tracker.columns.add')}
      </Button>
    </div>
  );
}
