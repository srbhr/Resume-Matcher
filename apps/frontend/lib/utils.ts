import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines multiple class names or class name objects into a single string.
 * Uses clsx for conditional class logic.
 *
 * @param inputs - Class values to be combined (strings, objects, arrays)
 * @returns A string of combined class names
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date range string with a hyphen separator for ATS compatibility.
 * Uses ASCII hyphen-minus (-) instead of en-dash for reliable PDF text extraction.
 *
 * Handles various input formats:
 * - "Jun 2025 Aug 2025" → "Jun 2025 - Aug 2025"
 * - "Jun 2025 - Aug 2025" → "Jun 2025 - Aug 2025"
 * - "2023 2025" → "2023 - 2025"
 * - "Present" → "Present" (no change for single dates)
 *
 * @param dateString - The date range string to format
 * @returns Formatted date string with hyphen separator
 */
export function formatDateRange(dateString: string | undefined | null): string {
  if (!dateString) return '';

  // Normalize any existing dashes (en-dash, em-dash) to hyphen-minus for ATS compatibility
  let formatted = dateString.replace(/[–—]/g, '-');

  // Normalize spacing around existing hyphens
  formatted = formatted.replace(/\s*-\s*/g, ' - ');

  // Handle "Jun 2025 Aug 2025" pattern (month year month year without separator)
  // Match: word/abbrev + 4-digit year + space + word/abbrev + 4-digit year
  formatted = formatted.replace(/([A-Za-z]+\.?\s+\d{4})\s+([A-Za-z]+\.?\s+\d{4})/g, '$1 - $2');

  // Handle "2023 2025" pattern (year year without separator)
  formatted = formatted.replace(/(\d{4})\s+(\d{4})/g, '$1 - $2');

  // Handle "Jun 2025 Present" pattern
  formatted = formatted.replace(
    /([A-Za-z]+\.?\s+\d{4})\s+(Present|Current|Now|Ongoing)/gi,
    '$1 - $2'
  );

  return formatted;
}
