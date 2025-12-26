'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { type PageSize, type MarginSettings } from '@/lib/types/template-settings';
import { getContentAreaPx } from '@/lib/constants/page-dimensions';

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
 * Respects section boundaries to avoid splitting content mid-section.
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

      // Find individual items that should not be split (NOT entire sections)
      // - .resume-item: Individual job entries, project entries, education entries
      // - [data-no-break]: Explicitly marked elements
      // NOTE: We do NOT include .resume-section because sections SHOULD span pages
      const items = container.querySelectorAll('.resume-item, [data-no-break]');
      const itemBounds: { top: number; bottom: number; element: Element }[] = [];

      items.forEach((item) => {
        const rect = item.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        itemBounds.push({
          top: rect.top - containerRect.top,
          bottom: rect.bottom - containerRect.top,
          element: item,
        });
      });

      // Sort by top position for easier processing
      itemBounds.sort((a, b) => a.top - b.top);

      // Calculate page breaks
      const breakPoints: number[] = [0]; // Start positions of each page
      let currentOffset = 0;

      while (currentOffset + pageHeight < contentHeight) {
        let nextBreak = currentOffset + pageHeight;

        // Check if this break would split an individual item
        for (const bound of itemBounds) {
          // If an item straddles the page break
          if (bound.top < nextBreak && bound.bottom > nextBreak) {
            // Move break to before this item starts
            // But only if it doesn't push us back too far (at least 50% of page used)
            // This ensures we fill pages well before moving items
            const proposedBreak = bound.top;
            if (proposedBreak > currentOffset + pageHeight * 0.5) {
              nextBreak = proposedBreak;
              break;
            }
            // If item is too large or would leave too much empty space,
            // just let it break naturally
          }
        }

        // Safety: ensure we make progress (at least 100px per page)
        if (nextBreak <= currentOffset + 100) {
          nextBreak = currentOffset + pageHeight;
        }

        currentOffset = nextBreak;

        // Only add break point if there's more content
        if (currentOffset < contentHeight) {
          breakPoints.push(currentOffset);
        }
      }

      // Convert break points to page objects with start and end
      const newPages: PageBreak[] = breakPoints.map((offset, index) => ({
        pageNumber: index + 1,
        contentOffset: offset,
        contentEnd: index < breakPoints.length - 1 ? breakPoints[index + 1] : contentHeight,
      }));

      setPages(newPages);
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
