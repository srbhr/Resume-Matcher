import { type PageSize, type MarginSettings } from '@/lib/types/template-settings';

/**
 * Page dimensions in millimeters for supported page sizes
 */
export const PAGE_DIMENSIONS = {
  A4: { width: 210, height: 297 },
  LETTER: { width: 215.9, height: 279.4 },
} as const;

/**
 * Convert millimeters to pixels at 96 DPI (standard screen resolution)
 */
export function mmToPx(mm: number): number {
  return (mm / 25.4) * 96;
}

/**
 * Convert pixels to millimeters at 96 DPI
 */
export function pxToMm(px: number): number {
  return (px * 25.4) / 96;
}

/**
 * Get the printable content area dimensions after accounting for margins
 */
export function getContentArea(
  pageSize: PageSize,
  margins: MarginSettings
): { width: number; height: number } {
  const page = PAGE_DIMENSIONS[pageSize];
  return {
    width: page.width - margins.left - margins.right,
    height: page.height - margins.top - margins.bottom,
  };
}

/**
 * Get the printable content area in pixels
 */
export function getContentAreaPx(
  pageSize: PageSize,
  margins: MarginSettings
): { width: number; height: number } {
  const area = getContentArea(pageSize, margins);
  return {
    width: mmToPx(area.width),
    height: mmToPx(area.height),
  };
}

/**
 * Calculate the scale factor to fit a page within a container
 * @param pageWidthMm - Page width in millimeters
 * @param containerWidthPx - Available container width in pixels
 * @returns Scale factor (0.0 - 1.0+)
 */
export function calculatePreviewScale(pageWidthMm: number, containerWidthPx: number): number {
  const pageWidthPx = mmToPx(pageWidthMm);
  return containerWidthPx / pageWidthPx;
}

/**
 * Get page dimensions in pixels
 */
export function getPageDimensionsPx(pageSize: PageSize): { width: number; height: number } {
  const dims = PAGE_DIMENSIONS[pageSize];
  return {
    width: mmToPx(dims.width),
    height: mmToPx(dims.height),
  };
}
