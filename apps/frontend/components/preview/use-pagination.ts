'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { type PageSize, type MarginSettings } from '@/lib/types/template-settings';
import { getContentAreaPx } from '@/lib/constants/page-dimensions';

export interface PageBreak {
  pageNumber: number;
  contentOffset: number; // Where this page starts in the content (px)
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
  const [pages, setPages] = useState<PageBreak[]>([{ pageNumber: 1, contentOffset: 0 }]);
  const [totalContentHeight, setTotalContentHeight] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePageBreaks = useCallback(() => {
    const container = measurementRef.current;
    if (!container) {
      setPages([{ pageNumber: 1, contentOffset: 0 }]);
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
        setPages([{ pageNumber: 1, contentOffset: 0 }]);
        setIsCalculating(false);
        return;
      }

      // Find all section elements that should not be split
      const sections = container.querySelectorAll('.resume-section, .resume-item, [data-no-break]');
      const sectionBounds: { top: number; bottom: number; element: Element }[] = [];

      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        sectionBounds.push({
          top: rect.top - containerRect.top,
          bottom: rect.bottom - containerRect.top,
          element: section,
        });
      });

      // Calculate page breaks
      const newPages: PageBreak[] = [{ pageNumber: 1, contentOffset: 0 }];
      let currentOffset = 0;
      let pageNumber = 1;

      while (currentOffset + pageHeight < contentHeight) {
        let nextBreak = currentOffset + pageHeight;

        // Check if this break would split a section
        for (const bound of sectionBounds) {
          // If a section straddles the page break
          if (bound.top < nextBreak && bound.bottom > nextBreak) {
            // Move break to before this section starts
            // But only if it doesn't push us back too far (at least 20% of page used)
            const proposedBreak = bound.top;
            if (proposedBreak > currentOffset + pageHeight * 0.2) {
              nextBreak = proposedBreak;
              break;
            }
            // If section is too large, we have to break it
            // (content taller than page height)
          }
        }

        // Safety: ensure we make progress (at least 50px per page)
        if (nextBreak <= currentOffset + 50) {
          nextBreak = currentOffset + pageHeight;
        }

        currentOffset = nextBreak;
        pageNumber++;

        // Only add page if there's more content
        if (currentOffset < contentHeight) {
          newPages.push({
            pageNumber,
            contentOffset: currentOffset,
          });
        }
      }

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
