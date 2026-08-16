'use client';

import * as React from 'react';
import { AlertTriangle, Lightbulb, ListChecks, MessageSquareText, Target } from 'lucide-react';
import { GeneratePrompt } from './generate-prompt';
import type {
  InterviewPrepData,
  InterviewPrepQuestion,
  InterviewPrepSkillGap,
} from '@/components/common/resume_previewer_context';
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

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="border-2 border-black bg-white p-4 space-y-3">
      <div className="flex items-center gap-2 border-b border-black/10 pb-2">
        <Icon className="w-4 h-4 text-blue-700" />
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
          <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-blue-700" />
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
        <div key={`${item.question}-${index}`} className="border border-black bg-paper-tint p-3">
          <p className="font-mono text-sm font-bold leading-relaxed">{item.question}</p>
          {item.focus_area && (
            <p className="mt-2 text-xs font-mono uppercase tracking-wide text-blue-700">
              {t('interviewPrep.focusArea')}: {item.focus_area}
            </p>
          )}
          {item.suggested_answer_points.length > 0 && (
            <div className="mt-3">
              <p className="font-mono text-xs font-bold uppercase text-steel-grey">
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
        <div key={`${item.skill}-${index}`} className="border border-black bg-paper-tint p-3">
          <p className="font-mono text-sm font-bold uppercase">{item.skill}</p>
          <div className="mt-3 space-y-2 text-sm text-ink-soft">
            <p>
              <span className="font-mono text-xs font-bold uppercase text-steel-grey">
                {t('interviewPrep.whyItMatters')}:{' '}
              </span>
              {item.why_it_matters}
            </p>
            <p>
              <span className="font-mono text-xs font-bold uppercase text-steel-grey">
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
          <div className="mb-4 flex items-start gap-3 border-2 border-red-700 bg-red-50 p-4 text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm font-mono leading-relaxed">{error}</p>
          </div>
        )}
        {isTailoredResume && !canGenerate ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] p-12 text-center">
            <div className="w-16 h-16 border-2 border-amber-700 bg-amber-50 flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-amber-700" />
            </div>
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-ink-soft mb-3">
              {t('interviewPrep.unavailableTitle')}
            </h3>
            <p className="font-mono text-xs text-steel-grey max-w-md leading-relaxed">
              {unavailableMessage ?? t('interviewPrep.missingContextDescription')}
            </p>
          </div>
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
      {error && (
        <div className="flex items-start gap-3 border-2 border-red-700 bg-red-50 p-4 text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm font-mono leading-relaxed">{error}</p>
        </div>
      )}
      {isTailoredResume && !canGenerate && (
        <div className="flex items-start gap-3 border-2 border-amber-700 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm font-mono leading-relaxed">
            {unavailableMessage ?? t('interviewPrep.missingContextDescription')}
          </p>
        </div>
      )}

      <Section title={t('interviewPrep.sections.roleFit')} icon={Target}>
        <StringList items={interviewPrep.role_fit_analysis} />
      </Section>

      <Section title={t('interviewPrep.sections.resumeQuestions')} icon={MessageSquareText}>
        <QuestionList items={interviewPrep.resume_questions} />
      </Section>

      <Section title={t('interviewPrep.sections.projectFollowUps')} icon={ListChecks}>
        <QuestionList items={interviewPrep.project_follow_ups} />
      </Section>

      <Section title={t('interviewPrep.sections.skillGaps')} icon={AlertTriangle}>
        <SkillGapList items={interviewPrep.skill_gaps} />
      </Section>

      <Section title={t('interviewPrep.sections.talkingPoints')} icon={Lightbulb}>
        <StringList items={interviewPrep.talking_points} />
      </Section>
    </div>
  );
}
