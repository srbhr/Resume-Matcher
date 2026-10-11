/**
 * Stable page-break hooks for every resume template.
 *
 * CSS-module class names are hashed at build time, so neither the print CSS
 * (`app/(default)/css/globals.css`) nor the builder preview's pagination
 * (`components/preview/page-breaks.ts`) can find entries and headings by class.
 * Templates spread these data attributes instead, and both read the same signal,
 * so the preview breaks pages where the PDF does.
 */

/** An entry with at least this many bullets may split between bullets. */
export const SPLIT_ENTRY_MIN_BULLETS = 4;

/**
 * One entry (a job, project, degree, skill row or citation). It stays whole on one
 * page, unless it has SPLIT_ENTRY_MIN_BULLETS or more bullets: then it may split
 * between bullets, keeping its header with the first two bullets and the last two
 * bullets together.
 */
export function resumeItem(bullets?: readonly unknown[] | null): { 'data-resume-item': string } {
  return {
    'data-resume-item': (bullets?.length ?? 0) >= SPLIT_ENTRY_MIN_BULLETS ? 'split' : '',
  };
}

/** A section heading: kept with the start of the content that follows it. */
export const RESUME_SECTION_TITLE = { 'data-resume-section-title': '' } as const;

/** A section: the heading and the entries it keeps company with. */
export const RESUME_SECTION = { 'data-resume-section': '' } as const;
