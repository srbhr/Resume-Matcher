'use client';

import React from 'react';
import { type PageSize, type MarginSettings } from '@/lib/types/template-settings';
import { PAGE_DIMENSIONS, mmToPx } from '@/lib/constants/page-dimensions';

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
        className="relative bg-white border-2 border-black shadow-sw-card origin-top"
        style={{
          width: pageWidthPx,
          height: pageHeightPx,
          transform: `scale(${scale})`,
          marginBottom: `${pageHeightPx * scale - pageHeightPx + 16}px`,
        }}
      >
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

        {/* Page number indicator */}
        <div
          className="absolute bottom-2 right-3 font-mono text-xs text-steel uppercase tracking-wider tabular-nums"
          style={{ transform: `scale(${1 / scale})`, transformOrigin: 'bottom right' }}
        >
          Page {pageNumber} of {totalPages}
        </div>
      </div>
    </div>
  );
}
