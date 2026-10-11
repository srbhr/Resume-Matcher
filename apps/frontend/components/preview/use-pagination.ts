'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { type PageSize, type MarginSettings } from '@/lib/types/template-settings';
import { getContentAreaPx } from '@/lib/constants/page-dimensions';
import { collectKeepZones, computePageStarts } from './page-breaks';

export interface PageBreak {
  pageNumber: number;
  contentOffset: number; // Where this page starts in the content (px)
  contentEnd: number; // Where this page ends in the content (px)
}

interface UsePaginationOptions {
  pageSize: PageSize;
  margins: MarginSettings;
  measurementRef: React.RefObject<HTMLDivElement | null>;
  debounceMs?: number;
}

interface UsePaginationResult {
  pages: PageBreak[];
  totalContentHeight: number;
  isCalculating: boolean;
}

/**
 * Custom hook for calculating page breaks based on content height.
 * Follows the PDF's break rules (see ./page-breaks.ts): entries stay whole, long
 * entries split between bullets, and headings stay with what follows them.
 */
export function usePagination({
  pageSize,
  margins,
  measurementRef,
  debounceMs = 150,
}: UsePaginationOptions): UsePaginationResult {
  const [pages, setPages] = useState<PageBreak[]>([
    { pageNumber: 1, contentOffset: 0, contentEnd: 0 },
  ]);
  const [totalContentHeight, setTotalContentHeight] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePageBreaks = useCallback(() => {
    const container = measurementRef.current;
    if (!container) {
      setPages([{ pageNumber: 1, contentOffset: 0, contentEnd: 0 }]);
      return;
    }

    setIsCalculating(true);

    // Wait for fonts to load before measuring
    document.fonts.ready.then(() => {
      const contentArea = getContentAreaPx(pageSize, margins);
      const pageHeight = contentArea.height;
      const contentHeight = container.scrollHeight;

      setTotalContentHeight(contentHeight);

      // If content fits on one page, we're done
      if (contentHeight <= pageHeight) {
        setPages([{ pageNumber: 1, contentOffset: 0, contentEnd: contentHeight }]);
        setIsCalculating(false);
        return;
      }

      // Break where the PDF does: the templates' data-resume-* hooks become keep zones.
      const breakPoints = computePageStarts(contentHeight, pageHeight, collectKeepZones(container));

      // Convert break points to page objects with start and end
      const newPages: PageBreak[] = breakPoints.map((offset, index) => ({
        pageNumber: index + 1,
        contentOffset: offset,
        contentEnd: index < breakPoints.length - 1 ? breakPoints[index + 1] : contentHeight,
      }));

      const nonEmptyPages = newPages.filter(
        (page, index) => page.contentEnd - page.contentOffset > 1 || index === 0
      );
      setPages(nonEmptyPages.length > 0 ? nonEmptyPages : newPages.slice(0, 1));
      setIsCalculating(false);
    });
  }, [pageSize, margins, measurementRef]);

  // Debounced recalculation
  const debouncedCalculate = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      calculatePageBreaks();
    }, debounceMs);
  }, [calculatePageBreaks, debounceMs]);

  // Set up observers for content changes
  useEffect(() => {
    const container = measurementRef.current;
    if (!container) return;

    // Initial calculation
    calculatePageBreaks();

    // ResizeObserver for size changes
    const resizeObserver = new ResizeObserver(() => {
      debouncedCalculate();
    });
    resizeObserver.observe(container);

    // MutationObserver for content changes
    const mutationObserver = new MutationObserver(() => {
      debouncedCalculate();
    });
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [calculatePageBreaks, debouncedCalculate, measurementRef]);

  // Recalculate when page size or margins change
  useEffect(() => {
    calculatePageBreaks();
  }, [pageSize, margins, calculatePageBreaks]);

  return { pages, totalContentHeight, isCalculating };
}
