'use client';

import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/lib/i18n';
import type { ResumeWizardProgress, ResumeWizardStep } from '@/lib/api/resume-wizard';

interface QuestionCardProps {
  step: ResumeWizardStep;
  question: string;
  sectionLabel: string;
  progress: ResumeWizardProgress;
  answer: string;
  onAnswerChange: (value: string) => void;
  canGoBack: boolean;
  isBusy: boolean;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
  onReview: () => void;
  onFinalize: () => void;
  onKeepAdding: () => void;
  warnings: string[];
}

export function QuestionCard({
  step,
  question,
  sectionLabel,
  progress,
  answer,
  onAnswerChange,
  canGoBack,
  isBusy,
  onContinue,
  onSkip,
  onBack,
  onReview,
  onFinalize,
  onKeepAdding,
  warnings,
}: QuestionCardProps) {
  const { t } = useTranslations();
  const isReview = step === 'review';
  const isQuestion = step === 'question';
  const canContinue = answer.trim().length > 0 && !isBusy;
  const totalSegments = Math.max(progress.total, 1);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Repo pattern: never let Enter bubble to a parent form/dialog.
    if (event.key !== 'Enter') return;
    event.stopPropagation();
    // Typeform feel: Enter submits, Shift+Enter makes a newline.
    if (!event.shiftKey) {
      event.preventDefault();
      if (canContinue) onContinue();
    }
  };

  return (
    <section className="border-2 border-black bg-white shadow-[8px_8px_0px_0px_#000000]">
      <div className="flex gap-1 border-b-2 border-black p-2" aria-hidden="true">
        {Array.from({ length: totalSegments }).map((_, index) => (
          <span
            key={index}
            className={
              index < progress.current
                ? 'h-1.5 flex-1 border border-black bg-black'
                : 'h-1.5 flex-1 border border-black bg-white'
            }
          />
        ))}
      </div>

      <div className="grid gap-6 p-5 md:p-8">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-blue-700">
          {sectionLabel}
        </p>
        <h1 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{question}</h1>

        {isReview ? (
          warnings.length > 0 && (
            <ul className="grid gap-2">
              {warnings.map((warning) => (
                <li
                  key={warning}
                  className="border border-steel-grey bg-white px-3 py-2 font-sans text-sm text-steel-grey"
                >
                  {warning}
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="grid gap-2">
            <label
              htmlFor="resume-wizard-answer"
              className="font-mono text-xs font-bold uppercase tracking-wider text-steel-grey"
            >
              {t('resumeWizard.answerLabel')}
            </label>
            <Textarea
              id="resume-wizard-answer"
              value={answer}
              onChange={(event) => onAnswerChange(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isBusy}
              className="min-h-40 bg-white font-sans text-base"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3 border-t-2 border-black pt-5">
          {isReview ? (
            <>
              <Button type="button" variant="success" onClick={onFinalize} disabled={isBusy}>
                {isBusy ? t('common.saving') : t('resumeWizard.actions.create')}
              </Button>
              <Button type="button" variant="outline" onClick={onKeepAdding} disabled={isBusy}>
                {t('resumeWizard.actions.keepAdding')}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={onContinue} disabled={!canContinue}>
                {isBusy ? t('common.loading') : t('resumeWizard.actions.continue')}
              </Button>
              {isQuestion && (
                <Button type="button" variant="outline" onClick={onSkip} disabled={isBusy}>
                  {t('resumeWizard.actions.skip')}
                </Button>
              )}
              {isQuestion && (
                <Button type="button" variant="outline" onClick={onReview} disabled={isBusy}>
                  {t('resumeWizard.actions.review')}
                </Button>
              )}
              {isQuestion && canGoBack && (
                <Button type="button" variant="ghost" onClick={onBack} disabled={isBusy}>
                  {t('resumeWizard.actions.back')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
