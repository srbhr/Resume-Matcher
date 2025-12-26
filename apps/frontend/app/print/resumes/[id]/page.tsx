import Resume, { ResumeData } from '@/components/dashboard/resume-component';
import {
  type TemplateType,
  type PageSize,
  type TemplateSettings,
  type SpacingLevel,
  DEFAULT_TEMPLATE_SETTINGS,
} from '@/lib/types/template-settings';
import { API_BASE } from '@/lib/api/client';

/**
 * Page dimensions in millimeters
 */
const PAGE_DIMENSIONS = {
  A4: { width: 210, height: 297 },
  LETTER: { width: 215.9, height: 279.4 },
} as const;

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
  }>;
};

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
    } catch {
      return {} as ResumeData;
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
  if (value === 'swiss-single' || value === 'swiss-two-column') {
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
    },
  };

  const pageDims = PAGE_DIMENSIONS[settings.pageSize];
  const { margins } = settings;

  return (
    <div
      className="resume-print bg-white"
      style={{
        width: `${pageDims.width}mm`,
        minHeight: `${pageDims.height}mm`,
        padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
        boxSizing: 'border-box',
      }}
    >
      <Resume resumeData={resumeData} template={settings.template} settings={settings} />
    </div>
  );
}
