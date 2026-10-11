'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReducedMotion } from 'motion/react';
import { DotsSixVertical, Stack } from '@phosphor-icons/react';
import { Card } from '@/components/ui/card';
import { useTranslations } from '@/lib/i18n';
import { formatDate } from '@/lib/format-date';
import type { Application } from '@/lib/api/tracker';

/** The house control focus ring, offset against the white card. */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white';

interface ApplicationCardProps {
  application: Application;
  selected: boolean;
  sharedResume: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

export function ApplicationCard({
  application,
  selected,
  sharedResume,
  onToggleSelect,
  onOpen,
}: ApplicationCardProps) {
  const { t, locale } = useTranslations();
  const reducedMotion = useReducedMotion();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: application.application_id,
    transition: reducedMotion ? null : { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const company = application.company?.trim();
  const role = application.role?.trim();

  return (
    <div ref={setNodeRef} style={style} className="transition-opacity">
      <Card variant="raised" noPadding className={`p-3 ${selected ? 'ring-2 ring-ink' : ''}`}>
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(application.application_id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('tracker.card.selectAria')}
            className={`mt-1 size-4 shrink-0 accent-ink ${FOCUS_RING}`}
          />

          <button
            type="button"
            onClick={() => onOpen(application.application_id)}
            className={`min-w-0 flex-1 text-left ${FOCUS_RING}`}
          >
            <p className="truncate text-sm font-semibold text-ink">
              {company || t('tracker.card.companyUnknown')}
            </p>
            <p className="truncate font-mono text-xs text-ink-soft">
              {role || t('tracker.card.roleUnknown')}
            </p>
            {application.applied_at && (
              <p className="mt-1 font-mono text-xs uppercase tracking-wide text-steel tabular-nums">
                {formatDate(application.applied_at, locale)}
              </p>
            )}
            {sharedResume && (
              <span className="mt-1 inline-flex items-center gap-1 border border-ink bg-paper px-1 font-mono text-xs uppercase text-ink-soft">
                <Stack aria-hidden="true" className="size-4" />
                {t('tracker.card.sharedResume')}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`mt-1 shrink-0 cursor-grab text-steel transition-colors hover:text-ink active:cursor-grabbing ${FOCUS_RING}`}
            aria-label={t('tracker.card.dragAria')}
            {...attributes}
            {...listeners}
          >
            <DotsSixVertical aria-hidden="true" className="size-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}
