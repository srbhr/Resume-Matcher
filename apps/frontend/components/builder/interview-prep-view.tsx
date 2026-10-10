'use client';

import * as React from 'react';
import { GeneratePrompt } from './generate-prompt';
import type {
  InterviewPrepData,
  InterviewPrepQuestion,
  InterviewPrepSkillGap,
} from '@/components/common/resume_previewer_context';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

interface InterviewPrepViewProps {
  interviewPrep: InterviewPrepData | null;
  isGenerating: boolean;
  error?: string | null;
  onGenerate: () => void;
  isTailoredResume: boolean;
  canGenerate?: boolean;
  unavailableMessage?: string | null;
  className?: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-2 border-ink bg-white p-4 space-y-3">
      <div className="border-b border-panel-hover pb-2">
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function StringList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function QuestionList({ items }: { items: InterviewPrepQuestion[] }) {
  const { t } = useTranslations();

  if (!items.length) return null;
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item.question}-${index}`} className="border border-ink bg-paper p-3">
          <p className="font-sans text-sm font-bold leading-relaxed">{item.question}</p>
          {item.focus_area && (
            <p className="mt-2 text-xs font-mono uppercase tracking-wide text-ink">
              {t('interviewPrep.focusArea')}: {item.focus_area}
            </p>
          )}
          {item.suggested_answer_points.length > 0 && (
            <div className="mt-3">
              <p className="font-mono text-xs font-bold uppercase text-steel">
                {t('interviewPrep.suggestedAnswerPoints')}
              </p>
              <StringList items={item.suggested_answer_points} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SkillGapList({ items }: { items: InterviewPrepSkillGap[] }) {
  const { t } = useTranslations();

  if (!items.length) return null;
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item.skill}-${index}`} className="border border-ink bg-paper p-3">
          <p className="font-mono text-sm font-bold uppercase">{item.skill}</p>
          <div className="mt-3 space-y-2 text-sm text-ink-soft">
            <p>
              <span className="font-mono text-xs font-bold uppercase text-steel">
                {t('interviewPrep.whyItMatters')}:{' '}
              </span>
              {item.why_it_matters}
            </p>
            <p>
              <span className="font-mono text-xs font-bold uppercase text-steel">
                {t('interviewPrep.preparationSuggestion')}:{' '}
              </span>
              {item.preparation_suggestion}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function InterviewPrepView({
  interviewPrep,
  isGenerating,
  error,
  onGenerate,
  isTailoredResume,
  canGenerate = true,
  unavailableMessage,
  className,
}: InterviewPrepViewProps) {
  const { t } = useTranslations();

  if (!interviewPrep) {
    return (
      <div className={className}>
        {error && (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        )}
        {isTailoredResume && !canGenerate ? (
          <EmptyState
            title={t('interviewPrep.unavailableTitle')}
            description={unavailableMessage ?? t('interviewPrep.missingContextDescription')}
          />
        ) : (
          <GeneratePrompt
            type="interview-prep"
            isGenerating={isGenerating}
            onGenerate={onGenerate}
            isTailoredResume={isTailoredResume}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4 p-6', className)}>
      {error && <Alert tone="error">{error}</Alert>}
      {isTailoredResume && !canGenerate && (
        <Alert tone="warning">
          {unavailableMessage ?? t('interviewPrep.missingContextDescription')}
        </Alert>
      )}

      <Section title={t('interviewPrep.sections.roleFit')}>
        <StringList items={interviewPrep.role_fit_analysis} />
      </Section>

      <Section title={t('interviewPrep.sections.resumeQuestions')}>
        <QuestionList items={interviewPrep.resume_questions} />
      </Section>

      <Section title={t('interviewPrep.sections.projectFollowUps')}>
        <QuestionList items={interviewPrep.project_follow_ups} />
      </Section>

      <Section title={t('interviewPrep.sections.skillGaps')}>
        <SkillGapList items={interviewPrep.skill_gaps} />
      </Section>

      <Section title={t('interviewPrep.sections.talkingPoints')}>
        <StringList items={interviewPrep.talking_points} />
      </Section>
    </div>
  );
}
