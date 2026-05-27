/**
 * Cover Letter Print Page
 *
 * Renders a cover letter for PDF generation. Fetches cover_letter_settings
 * from the resume record and applies configurable heading style.
 */

import type { Metadata } from 'next';
import { API_BASE } from '@/lib/api/client';
import { translate } from '@/lib/i18n/server';
import { resolveLocale } from '@/lib/i18n/locale';
import {
  type CoverLetterSettings,
  type CoverLetterHeadingField,
  type CoverLetterFontSizes,
  DEFAULT_COVER_LETTER_SETTINGS,
} from '@/lib/types/cover-letter-settings';

export const metadata: Metadata = { title: '' };

const PAGE_DIMENSIONS = {
  A4: { width: 210, height: 297 },
  LETTER: { width: 215.9, height: 279.4 },
} as const;

type PageSize = 'A4' | 'LETTER';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    pageSize?: string;
    lang?: string;
  }>;
};

interface PersonalInfo {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

interface CoverLetterData {
  coverLetter: string;
  personalInfo: PersonalInfo;
  settings: CoverLetterSettings;
}

async function fetchCoverLetterData(resumeId: string): Promise<CoverLetterData> {
  const res = await fetch(`${API_BASE}/resumes?resume_id=${encodeURIComponent(resumeId)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to load resume (status ${res.status}).`);
  }
  const payload = (await res.json()) as {
    data: {
      cover_letter?: string;
      cover_letter_settings?: Record<string, unknown> | null;
      processed_resume?: {
        personalInfo?: PersonalInfo;
      };
    };
  };

  const rawSettings = payload.data.cover_letter_settings;
  const settings: CoverLetterSettings = rawSettings
    ? {
        headingStyle:
          (rawSettings.headingStyle as CoverLetterSettings['headingStyle']) ??
          DEFAULT_COVER_LETTER_SETTINGS.headingStyle,
        headingFields:
          (rawSettings.headingFields as CoverLetterHeadingField[]) ??
          DEFAULT_COVER_LETTER_SETTINGS.headingFields,
        showTitle:
          rawSettings.showTitle !== undefined
            ? Boolean(rawSettings.showTitle)
            : DEFAULT_COVER_LETTER_SETTINGS.showTitle,
        fontSizes: {
          ...DEFAULT_COVER_LETTER_SETTINGS.fontSizes,
          ...((rawSettings.fontSizes as Partial<CoverLetterFontSizes>) ?? {}),
        },
      }
    : DEFAULT_COVER_LETTER_SETTINGS;

  return {
    coverLetter: payload.data.cover_letter || '',
    personalInfo: payload.data.processed_resume?.personalInfo || {},
    settings,
  };
}

function parsePageSize(value: string | undefined): PageSize {
  if (value === 'A4' || value === 'LETTER') return value;
  return 'A4';
}

function getFieldValue(
  personalInfo: PersonalInfo,
  field: CoverLetterHeadingField
): string | undefined {
  return personalInfo[field];
}

export default async function PrintCoverLetterPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const pageSize = parsePageSize(resolvedSearchParams?.pageSize);
  const pageDims = PAGE_DIMENSIONS[pageSize];
  const locale = resolveLocale(resolvedSearchParams?.lang);

  const { coverLetter, personalInfo, settings } = await fetchCoverLetterData(resolvedParams.id);

  const margins = { top: 25, right: 25, bottom: 25, left: 25 };

  const today = new Date().toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const nameFallback = translate(locale, 'resume.defaults.name');

  const paragraphs = coverLetter
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const centered = settings.headingStyle === 'centered';
  const minimal = settings.headingStyle === 'minimal';
  const fs = settings.fontSizes;

  const contactItems = settings.headingFields
    .map((f) => getFieldValue(personalInfo, f))
    .filter((v): v is string => !!v);

  const contactLine = contactItems.join('  ·  ');

  return (
    <div
      className="cover-letter-print bg-white"
      style={{
        width: `${pageDims.width}mm`,
        minHeight: `${pageDims.height}mm`,
        padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
        boxSizing: 'border-box',
        fontFamily: 'Georgia, "Times New Roman", serif',
        color: '#000000',
      }}
    >
      {/* Letterhead */}
      {minimal ? (
        /* Minimal style */
        <header
          style={{
            marginBottom: '8mm',
            paddingBottom: '4mm',
            borderBottom: '2px solid #000',
          }}
        >
          <h1
            style={{
              fontSize: `${fs.name}pt`,
              fontWeight: 'bold',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {personalInfo.name || nameFallback}
          </h1>
          {contactLine && (
            <div
              style={{
                marginTop: '2mm',
                fontSize: `${fs.contact}pt`,
                fontFamily: 'monospace',
                color: '#444',
              }}
            >
              {contactLine}
            </div>
          )}
        </header>
      ) : (
        /* Professional / Centered styles */
        <header
          style={{
            marginBottom: '8mm',
            paddingBottom: '4mm',
            borderBottom: '2px solid #000',
            textAlign: centered ? 'center' : 'left',
          }}
        >
          <h1
            style={{
              fontSize: `${fs.name}pt`,
              fontWeight: 'bold',
              margin: 0,
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}
          >
            {personalInfo.name || nameFallback}
          </h1>
          {settings.showTitle && personalInfo.title && (
            <p
              style={{
                fontFamily: 'Arial, sans-serif',
                fontSize: '10pt',
                color: '#444',
                margin: '2mm 0 0 0',
                fontWeight: 'normal',
              }}
            >
              {personalInfo.title}
            </p>
          )}
          {contactLine && (
            <div
              style={{
                marginTop: '3mm',
                fontSize: `${fs.contact}pt`,
                fontFamily: 'monospace',
                color: '#111',
                lineHeight: 1.6,
              }}
            >
              {contactLine}
            </div>
          )}
        </header>
      )}

      {/* Date */}
      <div
        style={{
          marginBottom: '8mm',
          fontSize: '9pt',
          fontFamily: 'monospace',
          color: '#444',
          textAlign: centered ? 'center' : 'left',
        }}
      >
        {today}
      </div>

      {/* Body */}
      <div style={{ lineHeight: '1.6' }}>
        {paragraphs.length > 0 ? (
          paragraphs.map((para, idx) => (
            <p
              key={idx}
              style={{
                fontSize: `${fs.body}pt`,
                margin: '0 0 4mm 0',
                textAlign: 'justify',
              }}
            >
              {para}
            </p>
          ))
        ) : (
          <p style={{ fontSize: '11pt', color: '#999' }}>
            {translate(locale, 'coverLetter.print.emptyContent')}
          </p>
        )}
      </div>
    </div>
  );
}
