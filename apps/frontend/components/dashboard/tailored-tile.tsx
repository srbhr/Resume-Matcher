'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  DotsThree,
  DownloadSimple,
  PencilSimple,
  SpinnerGap,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { NothingLoaded, withFallback } from '@/components/common/lazy-fallback';
import {
  STATUS_TONE,
  TILE_FILL,
  TILE_GHOST_ICON,
  TILE_ICON_ACTION,
  TILE_LINK,
  TILE_MENU_REVEAL,
  TILE_PAD,
  TILE_REVEAL,
  TILE_SHAPE,
  TILE_STATUS,
  TILE_WHITE,
  TILE_WHITE_BORDER,
} from '@/components/dashboard/tile-styles';
import type { ResumeListItem } from '@/lib/api/resume';
import { useTranslations } from '@/lib/i18n';
import { DEFAULT_TEMPLATE_SETTINGS, PAGE_SIZE_INFO } from '@/lib/types/template-settings';
import { cn } from '@/lib/utils';

// The tile menu (ui-sdk's Menu) loads after the page: nobody opens it before first paint,
// and it would otherwise add its whole popup layer to the dashboard's first-load JS.
// If its code fails to load, the tile keeps its other actions and the menu is left out.
const ActionMenu = dynamic(() =>
  withFallback(
    import('@/components/ui/action-menu').then((m) => m.ActionMenu),
    'Tile menu',
    NothingLoaded
  )
);

/** The template's translation key: `swiss-single` is `swissSingle`. */
const templateKey = (template: string) =>
  template.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

/** Up to three initials from the title's words, for the tile's square. */
function monogram(title: string): string {
  return title
    .split(/\s+/)
    .filter((word) => /^[a-zA-Z]/.test(word))
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

interface TailoredTileProps {
  resume: ResumeListItem;
  title: string;
  /** "2 days ago", and the exact date for its tooltip. */
  editedAgo: string;
  editedDate: string;
  downloading: boolean;
  duplicateDisabled: boolean;
  onDownload: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * One tailored resume on the dashboard: an ink square, the title on up to three
 * lines, when it was edited, and its template and page size. A ready tile shows
 * Open, Edit, Download PDF and a menu (Duplicate, Delete) on hover and keyboard
 * focus; one that isn't ready shows its status instead.
 */
export function TailoredTile({
  resume,
  title,
  editedAgo,
  editedDate,
  downloading,
  duplicateDisabled,
  onDownload,
  onDuplicate,
  onDelete,
}: TailoredTileProps) {
  const { t } = useTranslations();
  const settings = resume.template_settings ?? DEFAULT_TEMPLATE_SETTINGS;

  return (
    <Card variant="interactive" className={cn(TILE_SHAPE, TILE_PAD, TILE_FILL)}>
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-start gap-2 mb-3">
          <div
            className={cn(
              'size-12 shrink-0 border-2 border-ink bg-ink text-white flex items-center justify-center',
              TILE_WHITE_BORDER
            )}
          >
            <span className="font-mono font-bold">{monogram(title)}</span>
          </div>
          {resume.processing_status === 'ready' ? (
            // The row itself takes no taps until revealed, so on a touch screen
            // the tile opens wherever the hidden actions sit.
            <div className="pointer-events-none relative z-10 flex w-fit items-center gap-1 group-hover:pointer-events-auto group-has-[:focus-visible]:pointer-events-auto">
              <Link
                href={`/resumes/${resume.resume_id}`}
                aria-label={t('dashboard.tileActions.open', { title })}
                title={t('dashboard.tileActions.open', { title })}
                className={cn(TILE_ICON_ACTION, TILE_REVEAL)}
              >
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link
                href={`/builder?id=${resume.resume_id}`}
                aria-label={t('dashboard.tileActions.edit', { title })}
                title={t('dashboard.tileActions.edit', { title })}
                className={cn(TILE_ICON_ACTION, TILE_REVEAL)}
              >
                <PencilSimple aria-hidden="true" />
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn(TILE_GHOST_ICON, TILE_REVEAL)}
                aria-label={t('dashboard.tileActions.download', { title })}
                title={t('dashboard.tileActions.download', { title })}
                disabled={downloading}
                onClick={onDownload}
              >
                {downloading ? (
                  <SpinnerGap aria-hidden="true" className="animate-spin" />
                ) : (
                  <DownloadSimple aria-hidden="true" />
                )}
              </Button>
              <ActionMenu
                label={t('dashboard.tileActions.more', { title })}
                items={[
                  {
                    value: 'duplicate',
                    label: t('dashboard.duplicate'),
                    disabled: duplicateDisabled,
                  },
                  { value: 'delete', label: t('common.delete'), destructive: true },
                ]}
                onAction={(action) => (action === 'duplicate' ? onDuplicate() : onDelete())}
                triggerClassName={cn(TILE_GHOST_ICON, TILE_MENU_REVEAL)}
              >
                <DotsThree aria-hidden="true" />
              </ActionMenu>
            </div>
          ) : (
            <StatusIndicator tone={STATUS_TONE[resume.processing_status]} className={TILE_STATUS}>
              {t(`dashboard.status.${resume.processing_status}`)}
            </StatusIndicator>
          )}
        </div>
        <CardTitle className="text-lg">
          <Link
            href={`/resumes/${resume.resume_id}`}
            title={title}
            className={cn(
              'block font-serif text-base font-bold leading-tight w-full line-clamp-3',
              TILE_LINK
            )}
          >
            {title}
          </Link>
        </CardTitle>
        <div className="mt-auto space-y-1 pt-3">
          <CardDescription
            className={cn('text-xs uppercase tabular-nums', TILE_WHITE)}
            title={editedDate}
          >
            {t('dashboard.edited', { date: editedAgo })}
          </CardDescription>
          <CardDescription className={cn('text-xs uppercase', TILE_WHITE)}>
            {t(`builder.formatting.templates.${templateKey(settings.template)}.name`)}
            {' · '}
            {settings.pageSize === 'A4' ? PAGE_SIZE_INFO.A4.name : t('builder.pageSize.usLetter')}
          </CardDescription>
        </div>
      </div>
    </Card>
  );
}
