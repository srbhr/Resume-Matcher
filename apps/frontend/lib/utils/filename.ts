import type { ResumeData } from '@/components/dashboard/resume-component';
import type { Locale } from '@/i18n/config';
import type { TemplateSettings } from '@/lib/types/template-settings';

const MAX_FILENAME_LENGTH = 80;

function sanitizeSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function truncateFilename(value: string, extension: string): string {
  if (value.length <= MAX_FILENAME_LENGTH) return value;
  const maxBase = Math.max(10, MAX_FILENAME_LENGTH - extension.length - 1);
  return `${value.slice(0, maxBase)}.${extension}`;
}

function getPersonName(resumeData?: ResumeData): string | null {
  const name = resumeData?.personalInfo?.name?.trim();
  return name ? name : null;
}

function getTargetRole(resumeData?: ResumeData): string | null {
  const role = resumeData?.personalInfo?.title?.trim();
  return role ? role : null;
}

export function buildResumeFilename(
  resumeData: ResumeData | null,
  settings: TemplateSettings | undefined,
  locale: Locale | undefined
): string {
  const name = getPersonName(resumeData);
  const role = getTargetRole(resumeData);

  const segments = [
    name ? sanitizeSegment(name) : 'Resume',
    role ? sanitizeSegment(role) : null,
    settings?.template ? sanitizeSegment(settings.template) : null,
    locale ? sanitizeSegment(locale) : null,
    new Date().toISOString().slice(0, 10),
  ].filter(Boolean) as string[];

  const filename = segments.join('_') + '.pdf';
  return truncateFilename(filename, 'pdf');
}

export function buildCoverLetterFilename(
  resumeData: ResumeData | null,
  locale: Locale | undefined
): string {
  const name = getPersonName(resumeData);
  const segments = [
    name ? sanitizeSegment(name) : 'Cover_Letter',
    'Cover_Letter',
    locale ? sanitizeSegment(locale) : null,
    new Date().toISOString().slice(0, 10),
  ].filter(Boolean) as string[];

  const filename = segments.join('_') + '.pdf';
  return truncateFilename(filename, 'pdf');
}
