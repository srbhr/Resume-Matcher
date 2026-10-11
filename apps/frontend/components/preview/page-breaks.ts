/**
 * Where the builder preview breaks pages: the same rules the PDF follows.
 *
 * The print CSS (`app/(default)/css/globals.css`) keys on the data attributes in
 * `components/resume/page-break-attrs.ts`. This module reads the same attributes
 * from the measured layout and turns them into "keep together" zones, then cuts
 * pages the way Chromium does: a break that would fall inside a zone moves up to
 * the zone's top, unless the zone already starts the page (then it has to split).
 */

/** A vertical band, in px from the top of the content, that must not be split. */
export interface KeepZone {
  top: number;
  bottom: number;
  /** Set for a paragraph: it may break between lines, keeping 2 lines on each side. */
  lineHeight?: number;
}

const EPSILON = 0.5;
/** Lines kept together at the start and at the end of a broken paragraph (CSS orphans/widows). */
const MIN_LINES = 2;

/** Break position inside a paragraph zone, or its top when the paragraph cannot split there. */
function breakInsideLines(zone: KeepZone, at: number): number {
  const lineHeight = zone.lineHeight ?? 0;
  const lines = Math.round((zone.bottom - zone.top) / lineHeight);
  let before = Math.floor((at - zone.top + EPSILON) / lineHeight);
  if (lines - before < MIN_LINES) before = lines - MIN_LINES;
  if (before < MIN_LINES) return zone.top;
  return zone.top + before * lineHeight;
}

/**
 * Start offset of every page. Each page holds at most `pageHeight` px, and no page
 * starts inside a keep zone unless that zone is taller than the space it starts in
 * and already sits at the top of its page.
 */
export function computePageStarts(
  contentHeight: number,
  pageHeight: number,
  zones: readonly KeepZone[]
): number[] {
  const starts = [0];
  let offset = 0;
  while (offset + pageHeight < contentHeight - EPSILON) {
    let cut = offset + pageHeight;
    // Moving the cut above one zone can land it inside another (a heading kept
    // with its first entry), so repeat until no zone straddles it.
    let moved = true;
    while (moved) {
      moved = false;
      for (const zone of zones) {
        if (
          zone.top < cut - EPSILON &&
          zone.bottom > cut + EPSILON &&
          zone.top > offset + EPSILON
        ) {
          const next = zone.lineHeight ? breakInsideLines(zone, cut) : zone.top;
          if (next < cut - EPSILON) {
            cut = next;
            moved = true;
          }
        }
      }
    }
    // Always make progress, even if the zones leave no valid cut on this page.
    if (cut <= offset + EPSILON) cut = offset + pageHeight;
    starts.push(cut);
    offset = cut;
  }
  return starts;
}

function lineHeightOf(element: Element): number {
  const style = getComputedStyle(element);
  const lineHeight = parseFloat(style.lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
  const fontSize = parseFloat(style.fontSize);
  return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.2 : 0;
}

/** Keep zones of a rendered resume, in px from the top of `container`. */
export function collectKeepZones(container: HTMLElement): KeepZone[] {
  const originTop = container.getBoundingClientRect().top;
  const box = (element: Element): KeepZone => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top - originTop, bottom: rect.bottom - originTop };
  };
  const zones: KeepZone[] = [];
  // The first unsplittable band of each entry: what a heading must stay with.
  const leadZones = new Map<Element, KeepZone>();

  container.querySelectorAll('[data-resume-item], [data-no-break]').forEach((item) => {
    const whole = box(item);
    const bullets = Array.from(item.querySelectorAll('li'));
    if (item.getAttribute('data-resume-item') === 'split' && bullets.length >= 4) {
      // Header with the first two bullets, each bullet whole, the last two together.
      const lead = { top: whole.top, bottom: box(bullets[1]).bottom };
      zones.push(lead, { top: box(bullets[bullets.length - 2]).top, bottom: whole.bottom });
      bullets.forEach((bullet) => zones.push(box(bullet)));
      leadZones.set(item, lead);
      return;
    }
    zones.push(whole);
    leadZones.set(item, whole);
  });

  // List items outside entries stay whole too (one certification, one award).
  container.querySelectorAll('[data-resume-section] li').forEach((bullet) => {
    if (!bullet.closest('[data-resume-item], [data-no-break]')) zones.push(box(bullet));
  });

  // Paragraphs outside entries may break between lines.
  container.querySelectorAll('[data-resume-section] p').forEach((paragraph) => {
    if (paragraph.closest('[data-resume-item], [data-no-break], li')) return;
    const lineHeight = lineHeightOf(paragraph);
    if (lineHeight > 0) zones.push({ ...box(paragraph), lineHeight });
  });

  container.querySelectorAll('[data-resume-section-title]').forEach((title) => {
    const heading = box(title);
    const scope = title.closest('[data-resume-section]') ?? title.parentElement;
    const firstEntry = Array.from(
      scope?.querySelectorAll('[data-resume-item], [data-no-break]') ?? []
    ).find((el) => title.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    let bottom = heading.bottom;
    const lead = firstEntry && leadZones.get(firstEntry);
    if (lead) {
      bottom = lead.bottom;
    } else if (title.nextElementSibling) {
      // A heading over plain text keeps its first two lines.
      const next = box(title.nextElementSibling);
      const lineHeight = lineHeightOf(title.nextElementSibling);
      bottom =
        lineHeight > 0 ? Math.min(next.bottom, next.top + MIN_LINES * lineHeight) : next.bottom;
    }
    zones.push({ top: heading.top, bottom });
  });

  return zones;
}
