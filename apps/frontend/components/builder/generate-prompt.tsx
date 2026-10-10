'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Loader2 } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

export interface GeneratePromptProps {
  /** Type of content to generate */
  type: 'cover-letter' | 'outreach' | 'interview-prep';
  /** Whether generation is in progress */
  isGenerating: boolean;
  /** Callback to trigger generation */
  onGenerate: () => void;
  /** Whether this is a tailored resume (has job context) */
  isTailoredResume: boolean;
  /** Additional class names */
  className?: string;
}

export function GeneratePrompt({
  type,
  isGenerating,
  onGenerate,
  isTailoredResume,
  className,
}: GeneratePromptProps) {
  const { t } = useTranslations();
  const isOutreach = type === 'outreach';
  const isInterviewPrep = type === 'interview-prep';
  const title = isInterviewPrep
    ? t('interviewPrep.title')
    : isOutreach
      ? t('outreach.title')
      : t('coverLetter.title');

  // Show a different message if resume is not tailored
  if (!isTailoredResume) {
    return (
      <EmptyState
        className={className}
        title={t('builder.generatePrompt.notAvailableTitle', { title })}
        description={t('builder.generatePrompt.notAvailableDescription', { title })}
        action={
          <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">
            {t('builder.generatePrompt.goToDashboard')}
          </p>
        }
      />
    );
  }

  return (
    <EmptyState
      className={className}
      title={t('builder.generatePrompt.generateTitle', { title })}
      description={
        isInterviewPrep
          ? t('builder.generatePrompt.interviewPrepDescription')
          : isOutreach
            ? t('builder.generatePrompt.outreachDescription')
            : t('builder.generatePrompt.coverLetterDescription')
      }
      action={
        <div className="flex flex-col items-start gap-3">
          <Button onClick={onGenerate} disabled={isGenerating}>
            {isGenerating && <Loader2 aria-hidden="true" className="animate-spin" />}
            {isGenerating
              ? t('common.generating')
              : t('builder.generatePrompt.generateButton', { title })}
          </Button>
          <p className="font-mono text-xs text-steel">
            {isInterviewPrep
              ? t('builder.generatePrompt.interviewPrepFooter')
              : isOutreach
                ? t('builder.generatePrompt.outreachFooter')
                : t('builder.generatePrompt.coverLetterFooter')}
          </p>
        </div>
      }
    />
  );
}
