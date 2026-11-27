'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReducedMotion } from 'motion/react';
import { DotsSixVertical, FileText } from '@phosphor-icons/react';
import { Card } from '@/components/ui/card';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { useTranslations } from '@/lib/i18n';
import { calendarDaysBetween, formatDate, formatDaysAgo } from '@/lib/format-date';
import type { Application } from '@/lib/api/tracker';
import { daysSinceApplied, isFollowUpDue } from '@/lib/tracker-follow-up';
import { cn } from '@/lib/utils';

/** The house control focus ring, offset against the white card. */
const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white';

interface ApplicationCardProps {
  application: Application;
  selected: boolean;
  /** Any card on the board is selected: every checkbox shows, not just on hover. */
  selectionActive?: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

/**
 * "Applied 52 days ago", in the UI language; the exact date goes in a tooltip.
 * Counted in calendar days, so an application sent at 23:00 reads "yesterday"
 * the next morning, not "today".
 */
function appliedAgo(
  appliedAt: string,
  now: Date,
  locale: string,
  t: (key: string, p?: Record<string, string>) => string
) {
  const days = calendarDaysBetween(Date.parse(appliedAt), now.getTime());
  return t('tracker.card.appliedAgo', { when: formatDaysAgo(days, locale) });
}

export function ApplicationCard({
  application,
  selected,
  selectionActive = false,
  onToggleSelect,
  onOpen,
}: ApplicationCardProps) {
  const { t, locale } = useTranslations();
  const reducedMotion = useReducedMotion();
  // Read once: re-rendering must not change the output, and days are coarse.
  const [now] = useState(() => new Date());
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
  const days = daysSinceApplied(application.applied_at, now);
  const showCheckbox = selected || selectionActive;

  return (
    <div ref={setNodeRef} style={style} className="group transition-opacity">
      <Card variant="raised" noPadding className={`p-3 ${selected ? 'ring-2 ring-ink' : ''}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpen(application.application_id)}
              className={`block w-full text-left ${FOCUS_RING}`}
            >
              <p className="truncate text-sm font-semibold text-ink">
                {company || t('tracker.card.companyUnknown')}
              </p>
              <p className="line-clamp-2 font-mono text-xs text-ink-soft">
                {role || t('tracker.card.roleUnknown')}
              </p>
              {days !== null && application.applied_at && (
                <p
                  className="mt-1 font-mono text-xs text-steel tabular-nums"
                  title={formatDate(application.applied_at, locale)}
                >
                  {appliedAgo(application.applied_at, now, locale, t)}
                </p>
              )}
              {isFollowUpDue(application, now) && (
                <StatusIndicator tone="warning" live={false} className="mt-1 flex">
                  {t('tracker.followUp.due')}
                </StatusIndicator>
              )}
            </button>
            {application.resume_id && (
              <Link
                href={`/resumes/${application.resume_id}`}
                className={cn(
                  'mt-1 inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs text-primary underline-offset-2 hover:underline',
                  FOCUS_RING
                )}
              >
                <FileText aria-hidden="true" className="size-4 shrink-0" />
                {t('tracker.card.viewResume')}
              </Link>
            )}
          </div>

          {/* Card controls, stacked at the right edge so the text keeps the width. */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            <button
              type="button"
              className={`cursor-grab text-steel transition-colors hover:text-ink active:cursor-grabbing ${FOCUS_RING}`}
              aria-label={t('tracker.card.dragAria')}
              {...attributes}
              {...listeners}
            >
              <DotsSixVertical aria-hidden="true" className="size-4" />
            </button>
            {/* Shown on hover, on keyboard focus, and on every card once one is
                selected; always where there is no hover (touch). */}
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(application.application_id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={t('tracker.card.selectAria')}
              className={cn(
                'size-4 accent-ink transition-opacity',
                FOCUS_RING,
                !showCheckbox &&
                  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'
              )}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
