'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';
import {
  type CoverLetterSettings,
  type CoverLetterHeadingField,
  DEFAULT_COVER_LETTER_SETTINGS,
  type CoverLetterFontSizes,
} from '@/lib/types/cover-letter-settings';

export interface CoverLetterPersonalInfo {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
}

export interface CoverLetterPreviewProps {
  /** Cover letter content */
  content: string;
  /** Personal info for header */
  personalInfo: CoverLetterPersonalInfo;
  /** Page size for styling */
  pageSize?: 'A4' | 'LETTER';
  /** Heading/display settings */
  settings?: CoverLetterSettings;
  /** Additional class names */
  className?: string;
}

function getFieldValue(
  personalInfo: CoverLetterPersonalInfo,
  field: CoverLetterHeadingField
): string | undefined {
  return personalInfo[field];
}

function ContactLine({
  personalInfo,
  fields,
  style,
  fontSizes,
}: {
  personalInfo: CoverLetterPersonalInfo;
  fields: CoverLetterHeadingField[];
  style: CoverLetterSettings['headingStyle'];
  fontSizes: CoverLetterFontSizes;
}) {
  const items = fields.map((f) => getFieldValue(personalInfo, f)).filter((v): v is string => !!v);

  if (items.length === 0) return null;

  const centered = style === 'centered';

  return (
    <div
      className={cn('font-mono leading-[1.6] text-ink', centered ? 'text-center' : 'text-left')}
      style={{ fontSize: `${fontSizes.contact}pt` }}
    >
      {items.join('  ·  ')}
    </div>
  );
}

export function CoverLetterPreview({
  content,
  personalInfo,
  pageSize = 'A4',
  settings,
  className,
}: CoverLetterPreviewProps) {
  const { t, locale } = useTranslations();
  const s = settings ?? DEFAULT_COVER_LETTER_SETTINGS;
  const fs = s.fontSizes ?? DEFAULT_COVER_LETTER_SETTINGS.fontSizes;

  const today = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const paragraphs = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const centered = s.headingStyle === 'centered';
  const minimal = s.headingStyle === 'minimal';

  return (
    <div
      className={cn(
        'bg-white border-2 border-black',
        'shadow-sw-default',
        'overflow-hidden',
        className
      )}
    >
      <div
        className={cn('p-8 md:p-12', pageSize === 'A4' ? 'min-h-[297mm]' : 'min-h-[11in]')}
        style={{ maxWidth: pageSize === 'A4' ? '210mm' : '8.5in' }}
      >
        {/* Letterhead */}
        {minimal ? (
          /* Minimal (original) style */
          <header className="mb-8 border-b-2 border-black pb-4">
            <h1
              className="font-serif font-bold tracking-tight"
              style={{ fontSize: `${fs.name}pt` }}
            >
              {personalInfo.name || t('coverLetter.preview.defaultName')}
            </h1>
            <div className="mt-2 text-ink-soft flex flex-wrap gap-x-4 gap-y-1">
              <ContactLine
                personalInfo={personalInfo}
                fields={s.headingFields}
                style={s.headingStyle}
                fontSizes={fs}
              />
            </div>
          </header>
        ) : (
          /* Professional / Centered styles */
          <header className={cn('mb-8 pb-4 border-b-2 border-black', centered && 'text-center')}>
            <h1
              className={cn(
                'font-serif font-bold tracking-[-0.01em] leading-none',
                centered && 'text-center'
              )}
              style={{ fontSize: `${fs.name}pt` }}
            >
              {personalInfo.name || t('coverLetter.preview.defaultName')}
            </h1>
            {s.showTitle && personalInfo.title && (
              <p className={cn('font-sans text-sm mt-1 text-ink-soft', centered && 'text-center')}>
                {personalInfo.title}
              </p>
            )}
            <div className="mt-3">
              <ContactLine
                personalInfo={personalInfo}
                fields={s.headingFields}
                style={s.headingStyle}
                fontSizes={fs}
              />
            </div>
          </header>
        )}

        {/* Date */}
        <div className="mb-8">
          <p className={cn('font-mono text-xs text-ink-soft', centered && 'text-center')}>
            {today}
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4">
          {paragraphs.length > 0 ? (
            paragraphs.map((para, idx) => (
              <p
                key={idx}
                className="font-serif leading-relaxed text-ink"
                style={{ fontSize: `${fs.body}pt` }}
              >
                {para}
              </p>
            ))
          ) : (
            <div className="text-center py-12 text-steel-grey">
              <p className="font-mono text-sm">{t('coverLetter.preview.emptyTitle')}</p>
              <p className="font-mono text-xs mt-2">{t('coverLetter.preview.emptyDescription')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
