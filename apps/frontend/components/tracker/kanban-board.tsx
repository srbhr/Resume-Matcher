'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
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

  // Horizontal-scroll affordance: the seven stages overflow the canvas, so we
  // track whether more columns sit off-screen and surface controls + a stage
  // rail so no section is ever silently lost beyond the edge.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const load = async () => {
    try {
      const data = await listApplications();
      // Ensure all seven keys exist even if the server omits an empty one.
      setColumns({ ...emptyColumns(), ...data.columns });
      setError(null);
    } catch {
      setError(t('tracker.errors.loadFailed'));
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Board width is driven by the seven fixed-width columns, so we only need to
    // (re)attach when the board appears — not on every card-list change.
    const sync = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 4);
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      el.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [loading, isEmpty]);

  const scrollByColumn = (direction: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });
  };

  const scrollToColumn = (status: ApplicationStatus) => {
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-column="${status}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const plan = planMove(columns, String(active.id), String(over.id));
    if (!plan) return;

    // Optimistic update. If the server rejects the move we re-load authoritative
    // state from the server rather than reverting to a captured snapshot, which
    // could be stale if another move/refresh landed in the meantime.
    setColumns(plan.next);
    updateApplication(String(active.id), { status: plan.status, position: plan.position }).catch(
      async () => {
        // Re-sync authoritative state, THEN show a generic failure message:
        // load() clears the error on success, so set it afterwards to keep it
        // visible. Never echo raw backend error text (it could leak secrets).
        await load();
        setError(t('tracker.errors.moveFailed'));
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
    } catch {
      setError(t('tracker.errors.moveFailed'));
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      await bulkDeleteApplications(ids);
      clearSelection();
      await load();
    } catch {
      setError(t('tracker.errors.deleteFailed'));
    }
  };

  const showScrollControls = !isEmpty && (canScrollLeft || canScrollRight);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header — mirrors the dashboard canvas header */}
      <div className="flex shrink-0 flex-col gap-4 border-b border-black p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <h1 className="font-serif text-3xl font-bold uppercase tracking-tight text-ink md:text-4xl">
            {t('tracker.title')}
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink-soft">
            {t('tracker.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {showScrollControls && (
            <div className="flex items-center">
              <button
                type="button"
                aria-label={t('tracker.scroll.prev')}
                onClick={() => scrollByColumn(-1)}
                disabled={!canScrollLeft}
                className="flex h-10 w-10 items-center justify-center border border-black bg-background text-ink shadow-sw-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t('tracker.scroll.next')}
                onClick={() => scrollByColumn(1)}
                disabled={!canScrollRight}
                className="-ml-px flex h-10 w-10 items-center justify-center border border-black bg-background text-ink shadow-sw-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <Button onClick={() => setManualAddOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('tracker.addApplication')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-black bg-background px-6 py-3 font-mono text-xs text-destructive md:px-8">
          {error}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="shrink-0 border-b border-black px-6 py-3 md:px-8">
          <BulkActionBar
            selectedCount={selectedIds.size}
            onMove={handleBulkMove}
            onDelete={handleBulkDelete}
            onClear={clearSelection}
          />
        </div>
      )}

      {/* Board — flexes to fill the remaining canvas height; columns scroll
          horizontally as a group and vertically within each stage. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-steel-grey" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
            <p className="font-serif text-lg text-ink">{t('tracker.empty.title')}</p>
            <p className="mt-1 font-mono text-xs text-ink-soft">{t('tracker.empty.description')}</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragEnd={handleDragEnd}
          >
            <div ref={scrollRef} className="flex min-h-0 flex-1 overflow-x-auto">
              {APPLICATION_STATUS_ORDER.map((status, index) => (
                <div
                  key={status}
                  data-column={status}
                  className={`flex ${
                    index < APPLICATION_STATUS_ORDER.length - 1 ? 'border-r border-black' : ''
                  }`}
                >
                  <KanbanColumn
                    status={status}
                    applications={columns[status]}
                    selectedIds={selectedIds}
                    sharedResumeIds={sharedResumeIds}
                    onToggleSelect={toggleSelect}
                    onOpen={setOpenCardId}
                  />
                </div>
              ))}
            </div>
          </DndContext>
        )}
      </div>

      {/* Stage rail — an always-visible map of every stage (with counts) so
          off-screen sections are never lost; click a stage to jump to it. */}
      {!isEmpty && (
        <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-t border-black bg-paper-tint px-6 py-2 md:px-8">
          {canScrollRight && (
            <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-wide text-primary">
              {t('tracker.scroll.hint')}
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="flex items-center gap-2">
            {APPLICATION_STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => scrollToColumn(status)}
                className="flex shrink-0 items-center gap-1.5 border border-black bg-background px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-ink-soft shadow-sw-xs transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:text-primary hover:shadow-none"
              >
                {t(`tracker.columns.${status}`)}
                <span className="text-steel-grey">{columns[status].length}</span>
              </button>
            ))}
          </div>
        </div>
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
