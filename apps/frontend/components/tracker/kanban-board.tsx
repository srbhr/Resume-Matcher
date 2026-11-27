'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
import { useReducedMotion } from 'motion/react';
import { ArrowLeft, Plus, Gear, SpinnerGap } from '@phosphor-icons/react';
import { Button, buttonClass } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
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
import { ManageColumnsDialog } from './manage-columns-dialog';
import { OpenCardFromUrl } from './open-card-from-url';
import {
  readHiddenStatuses,
  toggleHiddenStatus,
  writeHiddenStatuses,
} from '@/lib/utils/tracker-column-visibility';

function emptyColumns(): ApplicationColumns {
  return APPLICATION_STATUS_ORDER.reduce((acc, status) => {
    acc[status] = [];
    return acc;
  }, {} as ApplicationColumns);
}

export function KanbanBoard() {
  const { t } = useTranslations();
  const reducedMotion = useReducedMotion();
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
  // The stage a column's own Add button preselects in the dialog.
  const [addStatus, setAddStatus] = useState<ApplicationStatus>('applied');
  const [manageOpen, setManageOpen] = useState(false);
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<ApplicationStatus>>(() =>
    readHiddenStatuses()
  );

  // Persist on an actual change only — an effect keyed on the state would also
  // write the just-read value straight back on mount.
  const handleToggleStatus = (status: ApplicationStatus) => {
    const next = toggleHiddenStatus(hiddenStatuses, status);
    // Refused (last visible stage): identical instance, nothing to store.
    if (next === hiddenStatuses) return;
    setHiddenStatuses(next);
    writeHiddenStatuses(next);
  };

  // The columns share the board's width and only scroll sideways when they can't
  // all fit. Then a stage rail (one chip per stage) is the way across.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

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

  const visibleStatuses = useMemo(
    () => APPLICATION_STATUS_ORDER.filter((status) => !hiddenStatuses.has(status)),
    [hiddenStatuses]
  );

  const isEmpty = allCards.length === 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Overflow depends on the board's width and the visible stage count, not on
    // the cards, so re-check on resize and when stages are hidden or shown.
    const sync = () => setOverflows(el.scrollWidth - el.clientWidth > 4);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [loading, isEmpty, hiddenStatuses]);

  const scrollToColumn = (status: ApplicationStatus) => {
    scrollRef.current?.querySelector<HTMLElement>(`[data-column="${status}"]`)?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
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

  const openAdd = (status: ApplicationStatus) => {
    setAddStatus(status);
    setManualAddOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header — a compact single-row toolbar (not the default PageHeader):
          this is a full-height working view, so the band stays short and the
          board keeps the height. Wraps onto more rows on narrow screens. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-ink px-6 py-3">
        <Link href="/dashboard" className={buttonClass({ variant: 'outline', size: 'sm' })}>
          <ArrowLeft aria-hidden="true" />
          {t('nav.backToDashboard')}
        </Link>
        {/* min-w keeps the title readable: with a 0 basis the actions would
            never wrap and would squeeze the title to nothing. */}
        <div className="flex min-w-[14rem] flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-serif text-2xl font-bold uppercase leading-tight tracking-tight text-ink md:text-3xl">
            {t('tracker.title')}
          </h1>
          <p className="font-mono text-xs uppercase tracking-wide text-steel">
            {'// '}
            {t('tracker.subtitle')}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setManageOpen(true)}>
            <Gear aria-hidden="true" />
            {t('tracker.manage')}
          </Button>
          <Button type="button" size="sm" onClick={() => openAdd('applied')}>
            <Plus aria-hidden="true" />
            {t('tracker.addApplication')}
          </Button>
        </div>
      </header>

      {error && (
        <div className="shrink-0 border-b border-ink px-6 py-3 md:px-8">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="shrink-0 border-b border-ink px-6 py-3 md:px-8">
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
          <div role="status" className="flex flex-1 items-center justify-center">
            <SpinnerGap aria-hidden="true" className="size-6 animate-spin text-steel" />
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        ) : isEmpty ? (
          <EmptyState
            title={t('tracker.empty.title')}
            description={t('tracker.empty.description')}
            className="p-6 md:p-8"
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragEnd={handleDragEnd}
          >
            {/* Every stage shares the width, 12rem at the least, so all seven fit
                from about 1400px; narrower, the board scrolls sideways. */}
            <div
              ref={scrollRef}
              className="grid min-h-0 flex-1 overflow-x-auto"
              style={{
                gridTemplateColumns: `repeat(${visibleStatuses.length}, minmax(12rem, 1fr))`,
              }}
            >
              {visibleStatuses.map((status, index) => (
                <div
                  key={status}
                  data-column={status}
                  className={`flex min-h-0 min-w-0 ${
                    index < visibleStatuses.length - 1 ? 'border-r border-ink' : ''
                  }`}
                >
                  <KanbanColumn
                    status={status}
                    applications={columns[status]}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onOpen={setOpenCardId}
                    onAdd={openAdd}
                  />
                </div>
              ))}
            </div>
          </DndContext>
        )}
      </div>

      {/* Stage rail: only when some stages sit off-screen. One chip per stage, with
          its count; a chip scrolls its stage into view. */}
      {!isEmpty && overflows && (
        <nav
          aria-label={t('tracker.scroll.rail')}
          className="flex shrink-0 items-center gap-3 overflow-x-auto border-t border-ink bg-paper px-6 py-2 md:px-8"
        >
          <div className="flex items-center gap-2">
            {visibleStatuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => scrollToColumn(status)}
                className={buttonClass({ variant: 'outline', size: 'sm', className: 'shrink-0' })}
              >
                {t(`tracker.columns.${status}`)}
                <span className="text-ink-soft tabular-nums">{columns[status].length}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      <Suspense fallback={null}>
        <OpenCardFromUrl onOpen={setOpenCardId} />
      </Suspense>

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
        initialStatus={addStatus}
        onCreated={load}
      />

      <ManageColumnsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        hiddenStatuses={hiddenStatuses}
        onToggle={handleToggleStatus}
      />
    </div>
  );
}
