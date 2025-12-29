/**
 * Resume Template Settings
 *
 * Defines the structure for template selection and formatting controls.
 * These settings affect both the live preview and PDF generation.
 */

export type TemplateType = 'swiss-single' | 'swiss-two-column';

export type PageSize = 'A4' | 'LETTER';

export type SpacingLevel = 1 | 2 | 3 | 4 | 5;

export type HeaderFontFamily = 'serif' | 'sans-serif' | 'mono';

export interface MarginSettings {
  top: number; // 5-25mm
  bottom: number;
  left: number;
  right: number;
}

export interface SpacingSettings {
  section: SpacingLevel; // Gap between major sections
  item: SpacingLevel; // Gap between items within sections
  lineHeight: SpacingLevel; // Text line height
}

export interface FontSizeSettings {
  base: SpacingLevel; // Overall text scale
  headerScale: SpacingLevel; // Header size multiplier
  headerFont: HeaderFontFamily; // Header font family
}

export interface TemplateSettings {
  template: TemplateType;
  pageSize: PageSize;
  margins: MarginSettings;
  spacing: SpacingSettings;
  fontSize: FontSizeSettings;
  compactMode: boolean; // Apply tighter spacing across the board
  showContactIcons: boolean; // Show icons next to contact info
}

/**
 * Default template settings
 */
export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  template: 'swiss-single',
  pageSize: 'A4',
  margins: { top: 10, bottom: 10, left: 10, right: 10 },
  spacing: { section: 3, item: 2, lineHeight: 3 },
  fontSize: { base: 3, headerScale: 3, headerFont: 'serif' },
  compactMode: false,
  showContactIcons: false,
};

/**
 * Page size dimensions for display
 */
export const PAGE_SIZE_INFO: Record<PageSize, { name: string; dimensions: string }> = {
  A4: { name: 'A4', dimensions: '210 × 297 mm' },
  LETTER: { name: 'US Letter', dimensions: '8.5 × 11 in' },
};

/**
 * CSS Variable mappings for spacing levels
 */
export const SECTION_SPACING_MAP: Record<SpacingLevel, string> = {
  1: '0.375rem', // 6px
  2: '0.625rem', // 10px
  3: '1rem', // 16px - default
  4: '1.25rem', // 20px
  5: '1.5rem', // 24px
};

export const ITEM_SPACING_MAP: Record<SpacingLevel, string> = {
  1: '0.125rem', // 2px
  2: '0.25rem', // 4px - default
  3: '0.5rem', // 8px
  4: '0.75rem', // 12px
  5: '1rem', // 16px
};

export const LINE_HEIGHT_MAP: Record<SpacingLevel, number> = {
  1: 1.15, // tight
  2: 1.25,
  3: 1.35, // default
  4: 1.45,
  5: 1.55, // loose
};

export const FONT_SIZE_MAP: Record<SpacingLevel, string> = {
  1: '11px',
  2: '12px',
  3: '14px', // default
  4: '15px',
  5: '16px',
};

export const HEADER_SCALE_MAP: Record<SpacingLevel, number> = {
  1: 1.5,
  2: 1.75,
  3: 2, // default
  4: 2.25,
  5: 2.5,
};

// Section header scale (SUMMARY, EXPERIENCE, etc.) - slightly smaller than name
export const SECTION_HEADER_SCALE_MAP: Record<SpacingLevel, number> = {
  1: 1.0,
  2: 1.1,
  3: 1.2, // default
  4: 1.3,
  5: 1.4,
};

// Header font family mapping
export const HEADER_FONT_MAP: Record<HeaderFontFamily, string> = {
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  'sans-serif': 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
};

// Compact mode multiplier (applied to spacing values only, NOT line-height)
export const COMPACT_MULTIPLIER = 0.6;

// Line height gets a gentler reduction in compact mode
export const COMPACT_LINE_HEIGHT_MULTIPLIER = 0.92;

/**
 * Convert TemplateSettings to CSS custom properties
 */
export function settingsToCssVars(settings?: TemplateSettings): React.CSSProperties {
  const s = settings || DEFAULT_TEMPLATE_SETTINGS;
  const compact = s.compactMode ? COMPACT_MULTIPLIER : 1;

  // Calculate margins (reduced by 40% in compact mode)
  const marginTop = s.compactMode ? s.margins.top * compact : s.margins.top;
  const marginBottom = s.compactMode ? s.margins.bottom * compact : s.margins.bottom;
  const marginLeft = s.compactMode ? s.margins.left * compact : s.margins.left;
  const marginRight = s.compactMode ? s.margins.right * compact : s.margins.right;

  return {
    '--section-gap': s.compactMode
      ? `calc(${SECTION_SPACING_MAP[s.spacing.section]} * ${compact})`
      : SECTION_SPACING_MAP[s.spacing.section],
    '--item-gap': s.compactMode
      ? `calc(${ITEM_SPACING_MAP[s.spacing.item]} * ${compact})`
      : ITEM_SPACING_MAP[s.spacing.item],
    // Line-height uses a gentler multiplier to avoid text overlap
    '--line-height': s.compactMode
      ? LINE_HEIGHT_MAP[s.spacing.lineHeight] * COMPACT_LINE_HEIGHT_MULTIPLIER
      : LINE_HEIGHT_MAP[s.spacing.lineHeight],
    '--font-size-base': FONT_SIZE_MAP[s.fontSize.base],
    '--header-scale': HEADER_SCALE_MAP[s.fontSize.headerScale],
    '--section-header-scale': SECTION_HEADER_SCALE_MAP[s.fontSize.headerScale],
    '--header-font': HEADER_FONT_MAP[s.fontSize.headerFont],
    '--margin-top': `${marginTop}mm`,
    '--margin-bottom': `${marginBottom}mm`,
    '--margin-left': `${marginLeft}mm`,
    '--margin-right': `${marginRight}mm`,
  } as React.CSSProperties;
}

/**
 * Template metadata for UI display
 */
export interface TemplateInfo {
  id: TemplateType;
  name: string;
  description: string;
}

export const TEMPLATE_OPTIONS: TemplateInfo[] = [
  {
    id: 'swiss-single',
    name: 'Single Column',
    description: 'Traditional full-width layout with maximum content density',
  },
  {
    id: 'swiss-two-column',
    name: 'Two Column',
    description: 'Experience-focused main column with sidebar for skills',
  },
];
