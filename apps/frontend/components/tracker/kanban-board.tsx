'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';
import {
  listApplications,
  updateApplication,
  bulkUpdateStatus,
  bulkDeleteApplications,
  APPLICATION_STATUS_ORDER,
  type Application,
  type ApplicationColumns,
  type ApplicationStatus,
} from '@/lib/api/tracker';
import { KanbanColumn } from './kanban-column';
import { BulkActionBar } from './bulk-action-bar';
import { CardDetailModal } from './card-detail-modal';
import { ManualAddApplicationDialog } from './manual-add-application-dialog';
import { planMove } from './reorder';

function emptyColumns(): ApplicationColumns {
  return APPLICATION_STATUS_ORDER.reduce((acc, status) => {
    acc[status] = [];
    return acc;
  }, {} as ApplicationColumns);
}

export function KanbanBoard() {
  const { t } = useTranslations();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [columns, setColumns] = useState<ApplicationColumns>(emptyColumns);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [manualAddOpen, setManualAddOpen] = useState(false);

  const load = async () => {
    try {
      const data = await listApplications();
      // Ensure all seven keys exist even if the server omits an empty one.
      setColumns({ ...emptyColumns(), ...data.columns });
      setError(null);
    } catch (err) {
      setError((err as Error).message || t('tracker.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allCards: Application[] = useMemo(
    () => APPLICATION_STATUS_ORDER.flatMap((status) => columns[status]),
    [columns]
  );

  // Master resume ids that back more than one card → "shared resume" badge.
  const sharedResumeIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of allCards) {
      if (card.master_resume_id) {
        counts.set(card.master_resume_id, (counts.get(card.master_resume_id) ?? 0) + 1);
      }
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [allCards]);

  const isEmpty = allCards.length === 0;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const plan = planMove(columns, String(active.id), String(over.id));
    if (!plan) return;

    const snapshot = columns;
    setColumns(plan.next);
    // Optimistic update; revert to the snapshot if the server rejects the move.
    updateApplication(String(active.id), { status: plan.status, position: plan.position }).catch(
      (err) => {
        setColumns(snapshot);
        setError((err as Error).message || t('tracker.errors.moveFailed'));
      }
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkMove = async (status: ApplicationStatus) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      await bulkUpdateStatus(ids, status);
      clearSelection();
      await load();
    } catch (err) {
      setError((err as Error).message || t('tracker.errors.moveFailed'));
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      await bulkDeleteApplications(ids);
      clearSelection();
      await load();
    } catch (err) {
      setError((err as Error).message || t('tracker.errors.deleteFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">{t('tracker.title')}</h1>
          <p className="font-mono text-xs text-ink-soft">{t('tracker.subtitle')}</p>
        </div>
        <Button onClick={() => setManualAddOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('tracker.addApplication')}
        </Button>
      </div>

      {error && (
        <div className="border border-black bg-background p-3 font-mono text-xs text-destructive shadow-sw-xs">
          {error}
        </div>
      )}

      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          onMove={handleBulkMove}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-steel-grey" />
        </div>
      ) : isEmpty ? (
        <div className="border border-dashed border-black bg-background p-10 text-center shadow-sw-xs">
          <p className="font-serif text-lg text-ink">{t('tracker.empty.title')}</p>
          <p className="mt-1 font-mono text-xs text-ink-soft">{t('tracker.empty.description')}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {APPLICATION_STATUS_ORDER.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                applications={columns[status]}
                selectedIds={selectedIds}
                sharedResumeIds={sharedResumeIds}
                onToggleSelect={toggleSelect}
                onOpen={setOpenCardId}
              />
            ))}
          </div>
        </DndContext>
      )}

      <CardDetailModal
        applicationId={openCardId}
        open={openCardId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenCardId(null);
        }}
        onUpdated={load}
      />

      <ManualAddApplicationDialog
        open={manualAddOpen}
        onOpenChange={setManualAddOpen}
        onCreated={load}
      />
    </div>
  );
}
