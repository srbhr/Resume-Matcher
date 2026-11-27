'use client';

import React from 'react';
import { type PageSize, type MarginSettings } from '@/lib/types/template-settings';
import { PAGE_DIMENSIONS, mmToPx } from '@/lib/constants/page-dimensions';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** One pair of marks per corner, anchored on the sheet's outer corner (the border is 1px). */
const TRIM_MARKS = [
  { anchor: '-left-px -top-px', horizontal: 'right-3 top-0', vertical: 'bottom-3 left-0' },
  { anchor: '-right-px -top-px', horizontal: 'left-3 top-0', vertical: 'bottom-3 right-0' },
  { anchor: '-bottom-px -left-px', horizontal: 'bottom-0 right-3', vertical: 'left-0 top-3' },
  { anchor: '-bottom-px -right-px', horizontal: 'bottom-0 left-3', vertical: 'right-0 top-3' },
];

interface PageContainerProps {
  pageSize: PageSize;
  margins: MarginSettings;
  pageNumber: number;
  totalPages: number;
  scale: number;
  showMarginGuides: boolean;
  children: React.ReactNode;
  contentOffset?: number; // Where this page's content starts (in px)
  contentEnd?: number; // Where this page's content ends (in px)
}

/**
 * PageContainer renders a single page at exact dimensions with optional margin guides.
 * Content is clipped to the printable area (page minus margins).
 * Uses contentOffset and contentEnd to show only the content for this specific page,
 * preventing duplication across pages.
 */
export function PageContainer({
  pageSize,
  margins,
  pageNumber,
  totalPages,
  scale,
  showMarginGuides,
  children,
  contentOffset = 0,
  contentEnd,
}: PageContainerProps) {
  const { t } = useTranslations();
  const pageDims = PAGE_DIMENSIONS[pageSize];
  const pageWidthPx = mmToPx(pageDims.width);
  const pageHeightPx = mmToPx(pageDims.height);

  const marginTopPx = mmToPx(margins.top);
  const marginBottomPx = mmToPx(margins.bottom);
  const marginLeftPx = mmToPx(margins.left);
  const marginRightPx = mmToPx(margins.right);

  const contentWidth = pageWidthPx - marginLeftPx - marginRightPx;
  const maxContentHeight = pageHeightPx - marginTopPx - marginBottomPx;

  // Calculate the actual visible height for this page
  // If contentEnd is provided, limit the height to avoid showing content that belongs on the next page
  const actualContentHeight = contentEnd
    ? Math.min(maxContentHeight, contentEnd - contentOffset)
    : maxContentHeight;

  return (
    <div className="relative flex flex-col items-center">
      {/* Page wrapper with scale transform */}
      <div
        className="relative bg-white border border-ink shadow-sw-nested origin-top"
        style={{
          width: pageWidthPx,
          height: pageHeightPx,
          transform: `scale(${scale})`,
          // 32px clears the trim marks (12px off the edge, 12px long) before the slug line.
          marginBottom: `${pageHeightPx * scale - pageHeightPx + 32}px`,
        }}
      >
        {/* Trim marks: where the paper ends. Kept 1px and 12px at every zoom. */}
        {TRIM_MARKS.map((mark) => (
          <span
            key={mark.anchor}
            aria-hidden="true"
            className={cn('pointer-events-none absolute size-0', mark.anchor)}
            style={{ transform: `scale(${1 / scale})` }}
          >
            <span className={cn('absolute h-px w-3 bg-ink', mark.horizontal)} />
            <span className={cn('absolute h-3 w-px bg-ink', mark.vertical)} />
          </span>
        ))}

        {/* Margin guides overlay */}
        {showMarginGuides && (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              top: marginTopPx,
              left: marginLeftPx,
              width: contentWidth,
              height: maxContentHeight,
              border: '1px dashed color-mix(in srgb, var(--sw-primary) 50%, transparent)',
            }}
          >
            {/* Corner markers */}
            <div className="absolute -top-1 -left-1 size-2 border-t border-l border-primary" />
            <div className="absolute -top-1 -right-1 size-2 border-t border-r border-primary" />
            <div className="absolute -bottom-1 -left-1 size-2 border-b border-l border-primary" />
            <div className="absolute -bottom-1 -right-1 size-2 border-b border-r border-primary" />
          </div>
        )}

        {/* Content area with clipping - uses actualContentHeight to prevent content overlap */}
        <div
          className="absolute overflow-hidden"
          style={{
            top: marginTopPx,
            left: marginLeftPx,
            width: contentWidth,
            height: actualContentHeight,
          }}
        >
          {/* Content positioned based on page offset */}
          <div
            className="absolute left-0 right-0"
            style={{
              top: -contentOffset,
              width: contentWidth,
            }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* Slug line: ours, outside the sheet, so everything on the sheet is the resume. */}
      <p
        className="flex justify-between gap-4 font-mono text-xs uppercase tracking-wider tabular-nums text-steel"
        style={{ width: pageWidthPx * scale }}
      >
        <span>
          {pageSize === 'LETTER' ? t('builder.pageSize.usLetter') : pageSize} · {pageDims.width} ×{' '}
          {pageDims.height} mm
        </span>
        <span>{t('preview.pageOfTotal', { page: pageNumber, total: totalPages })}</span>
      </p>
    </div>
  );
}
