import Resume, { ResumeData } from '@/components/dashboard/resume-component';
import {
  type TemplateType,
  type PageSize,
  type TemplateSettings,
  type SpacingLevel,
  type HeaderFontFamily,
  type BodyFontFamily,
  DEFAULT_TEMPLATE_SETTINGS,
} from '@/lib/types/template-settings';
import { API_BASE } from '@/lib/api/client';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    template?: string;
    pageSize?: string;
    marginTop?: string;
    marginBottom?: string;
    marginLeft?: string;
    marginRight?: string;
    sectionSpacing?: string;
    itemSpacing?: string;
    lineHeight?: string;
    fontSize?: string;
    headerScale?: string;
    headerFont?: string;
    bodyFont?: string;
    compactMode?: string;
    showContactIcons?: string;
  }>;
};

/**
 * Parse header font family
 */
function parseHeaderFont(value: string | undefined): HeaderFontFamily {
  if (value === 'serif' || value === 'sans-serif' || value === 'mono') {
    return value;
  }
  return DEFAULT_TEMPLATE_SETTINGS.fontSize.headerFont;
}

/**
 * Parse body font family
 */
function parseBodyFont(value: string | undefined): BodyFontFamily {
  if (value === 'serif' || value === 'sans-serif' || value === 'mono') {
    return value;
  }
  return DEFAULT_TEMPLATE_SETTINGS.fontSize.bodyFont;
}

/**
 * Parse boolean from string
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
}

async function fetchResumeData(id: string): Promise<ResumeData> {
  const res = await fetch(`${API_BASE}/resumes?resume_id=${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to load resume (status ${res.status}).`);
  }
  const payload = (await res.json()) as {
    data: { processed_resume?: ResumeData; raw_resume?: { content?: string } };
  };
  if (payload.data.processed_resume) {
    return payload.data.processed_resume;
  }
  if (payload.data.raw_resume?.content) {
    try {
      return JSON.parse(payload.data.raw_resume.content) as ResumeData;
    } catch (error) {
      // Log error for debugging instead of silently failing
      // Note: Avoid logging content preview to prevent PII exposure
      console.error('Failed to parse resume JSON:', {
        resumeId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
        contentLength: payload.data.raw_resume.content.length,
      });
      throw new Error('Failed to parse resume data. The resume content may be corrupted.');
    }
  }
  return {} as ResumeData;
}

/**
 * Parse spacing level from string, clamped to valid range 1-5
 */
function parseSpacingLevel(value: string | undefined, defaultValue: SpacingLevel): SpacingLevel {
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1 || num > 5) return defaultValue;
  return num as SpacingLevel;
}

/**
 * Parse margin value from string, clamped to valid range 5-25
 */
function parseMargin(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num)) return defaultValue;
  return Math.max(5, Math.min(25, num));
}

/**
 * Validate template type
 */
function parseTemplate(value: string | undefined): TemplateType {
  if (value === 'swiss-single' || value === 'swiss-two-column' || value === 'modern') {
    return value;
  }
  return 'swiss-single';
}

/**
 * Validate page size
 */
function parsePageSize(value: string | undefined): PageSize {
  if (value === 'A4' || value === 'LETTER') {
    return value;
  }
  return 'A4';
}

export default async function PrintResumePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resumeData = await fetchResumeData(resolvedParams.id);

  // Parse template settings from query params
  const settings: TemplateSettings = {
    template: parseTemplate(resolvedSearchParams?.template),
    pageSize: parsePageSize(resolvedSearchParams?.pageSize),
    margins: {
      top: parseMargin(resolvedSearchParams?.marginTop, DEFAULT_TEMPLATE_SETTINGS.margins.top),
      bottom: parseMargin(
        resolvedSearchParams?.marginBottom,
        DEFAULT_TEMPLATE_SETTINGS.margins.bottom
      ),
      left: parseMargin(resolvedSearchParams?.marginLeft, DEFAULT_TEMPLATE_SETTINGS.margins.left),
      right: parseMargin(
        resolvedSearchParams?.marginRight,
        DEFAULT_TEMPLATE_SETTINGS.margins.right
      ),
    },
    spacing: {
      section: parseSpacingLevel(
        resolvedSearchParams?.sectionSpacing,
        DEFAULT_TEMPLATE_SETTINGS.spacing.section
      ),
      item: parseSpacingLevel(
        resolvedSearchParams?.itemSpacing,
        DEFAULT_TEMPLATE_SETTINGS.spacing.item
      ),
      lineHeight: parseSpacingLevel(
        resolvedSearchParams?.lineHeight,
        DEFAULT_TEMPLATE_SETTINGS.spacing.lineHeight
      ),
    },
    fontSize: {
      base: parseSpacingLevel(
        resolvedSearchParams?.fontSize,
        DEFAULT_TEMPLATE_SETTINGS.fontSize.base
      ),
      headerScale: parseSpacingLevel(
        resolvedSearchParams?.headerScale,
        DEFAULT_TEMPLATE_SETTINGS.fontSize.headerScale
      ),
      headerFont: parseHeaderFont(resolvedSearchParams?.headerFont),
      bodyFont: parseBodyFont(resolvedSearchParams?.bodyFont),
    },
    compactMode: parseBoolean(
      resolvedSearchParams?.compactMode,
      DEFAULT_TEMPLATE_SETTINGS.compactMode
    ),
    showContactIcons: parseBoolean(
      resolvedSearchParams?.showContactIcons,
      DEFAULT_TEMPLATE_SETTINGS.showContactIcons
    ),
    accentColor: DEFAULT_TEMPLATE_SETTINGS.accentColor,
  };

  // Note: Margins are applied by Playwright's PDF renderer (not here)
  // This ensures margins appear on EVERY page, not just the first
  // The settings are passed to override CSS variables for spacing/fonts only
  const printSettings: TemplateSettings = {
    ...settings,
    // Zero out margins in CSS since Playwright handles them
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  };

  return (
    <div className="resume-print bg-white">
      <Resume resumeData={resumeData} template={settings.template} settings={printSettings} />
    </div>
  );
}
