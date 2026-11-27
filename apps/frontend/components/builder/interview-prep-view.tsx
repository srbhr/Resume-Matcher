'use client';

import * as React from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { GeneratePrompt } from './generate-prompt';
import type {
  InterviewPrepData,
  InterviewPrepQuestion,
  InterviewPrepSkillGap,
} from '@/components/common/resume_previewer_context';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';
import {
  EMPTY_PRACTICE,
  practiceKey,
  readInterviewPractice,
  writeInterviewPractice,
  type InterviewPractice,
} from '@/lib/utils/interview-practice-storage';

const LABEL = 'font-mono text-xs font-bold uppercase tracking-wider text-ink-soft';

function StringList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
          <span aria-hidden="true" className="mt-2 size-1 shrink-0 bg-ink" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-ink pt-4">
      <h3 className={LABEL}>{title}</h3>
      {children}
    </section>
  );
}

function SkillGapList({ items }: { items: InterviewPrepSkillGap[] }) {
  const { t } = useTranslations();
  if (!items.length) return null;
  return (
    <ul className="space-y-4">
      {items.map((item, index) => (
        <li key={`${item.skill}-${index}`} className="space-y-1">
          <p className="font-mono text-sm font-bold uppercase text-ink">{item.skill}</p>
          <p className="text-sm text-ink-soft">
            <span className="font-mono text-xs font-bold uppercase text-steel">
              {t('interviewPrep.whyItMatters')}:{' '}
            </span>
            {item.why_it_matters}
          </p>
          <p className="text-sm text-ink-soft">
            <span className="font-mono text-xs font-bold uppercase text-steel">
              {t('interviewPrep.preparationSuggestion')}:{' '}
            </span>
            {item.preparation_suggestion}
          </p>
        </li>
      ))}
    </ul>
  );
}

interface InterviewBriefProps {
  /** The tailored resume's title: the role and company it was made for. */
  title: string | null;
  keywords: string[] | null;
  jobDescription: string | null;
  prep: InterviewPrepData | null;
}

/**
 * The left half of interview prep: what you are preparing for. The job (its
 * title, the keywords it asks for, the full description on request), then, once
 * generated, where you are strong, where to prepare and the points to make.
 */
export function InterviewBrief({ title, keywords, jobDescription, prep }: InterviewBriefProps) {
  const { t } = useTranslations();
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className={LABEL}>{t('interviewPrep.brief.preparingFor')}</p>
        <h2 className="font-serif text-xl font-bold leading-tight text-ink text-balance">
          {title || t('interviewPrep.title')}
        </h2>
      </div>

      {(keywords?.length || jobDescription) && (
        <BriefSection title={t('interviewPrep.brief.lookingFor')}>
          {keywords && keywords.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <li
                  key={keyword}
                  className="border border-ink bg-white px-2 py-1 font-mono text-xs text-ink"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          )}
          {jobDescription && (
            <details className="group border border-ink bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-ink-soft hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                {t('interviewPrep.brief.fullDescription')}
                <CaretDown
                  aria-hidden="true"
                  className="size-4 text-steel transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="max-h-80 overflow-y-auto border-t border-ink p-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                {jobDescription}
              </div>
            </details>
          )}
        </BriefSection>
      )}

      {prep ? (
        <>
          {prep.role_fit_analysis.length > 0 && (
            <BriefSection title={t('interviewPrep.brief.strong')}>
              <StringList items={prep.role_fit_analysis} />
            </BriefSection>
          )}
          {prep.skill_gaps.length > 0 && (
            <BriefSection title={t('interviewPrep.brief.prepare')}>
              <SkillGapList items={prep.skill_gaps} />
            </BriefSection>
          )}
          {prep.talking_points.length > 0 && (
            <BriefSection title={t('interviewPrep.brief.points')}>
              <StringList items={prep.talking_points} />
            </BriefSection>
          )}
        </>
      ) : (
        <p className="max-w-[60ch] text-sm text-ink-soft text-pretty">
          {t('interviewPrep.brief.pending')}
        </p>
      )}
    </div>
  );
}

function QuestionRow({
  item,
  id,
  practised,
  note,
  onPractised,
  onNote,
}: {
  item: InterviewPrepQuestion;
  id: string;
  practised: boolean;
  note: string;
  onPractised: (value: boolean) => void;
  onNote: (value: string) => void;
}) {
  const { t } = useTranslations();
  // Answer points stay closed so the question can be tried first.
  const [showPoints, setShowPoints] = React.useState(false);
  // Open while a note exists (stored notes load after mount) until toggled.
  const [notesOpen, setNotesOpen] = React.useState<boolean | null>(null);
  const showNotes = notesOpen ?? Boolean(note);
  return (
    <li className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p
            className={cn(
              'font-serif text-base font-bold leading-snug text-ink',
              practised && 'text-ink-soft'
            )}
          >
            {item.question}
          </p>
          {item.focus_area && (
            <p className="font-mono text-xs uppercase tracking-wide text-steel">
              {t('interviewPrep.focusArea')}: {item.focus_area}
            </p>
          )}
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-wide text-ink">
          <input
            type="checkbox"
            checked={practised}
            onChange={(e) => onPractised(e.target.checked)}
            className="size-4 accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          />
          {t('interviewPrep.practice.practised')}
        </label>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {item.suggested_answer_points.length > 0 && (
          <button
            type="button"
            aria-expanded={showPoints}
            aria-controls={`${id}-points`}
            onClick={() => setShowPoints((open) => !open)}
            className="font-mono text-xs uppercase tracking-wide text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {showPoints
              ? t('interviewPrep.practice.hidePoints')
              : t('interviewPrep.practice.showPoints')}
          </button>
        )}
        <button
          type="button"
          aria-expanded={showNotes}
          aria-controls={`${id}-notes`}
          onClick={() => setNotesOpen(!showNotes)}
          className="font-mono text-xs uppercase tracking-wide text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('interviewPrep.practice.notes')}
        </button>
      </div>

      {showPoints && (
        <div id={`${id}-points`} className="border-l-2 border-ink pl-3">
          <p className="mb-2 font-mono text-xs font-bold uppercase text-steel">
            {t('interviewPrep.suggestedAnswerPoints')}
          </p>
          <StringList items={item.suggested_answer_points} />
        </div>
      )}
      {showNotes && (
        <Textarea
          id={`${id}-notes`}
          aria-label={t('interviewPrep.practice.notesLabel')}
          value={note}
          onChange={(e) => {
            // Keep the field open while its text is cleared.
            setNotesOpen(true);
            onNote(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.stopPropagation();
          }}
          className="min-h-20 text-sm"
        />
      )}
    </li>
  );
}

interface InterviewPrepViewProps {
  interviewPrep: InterviewPrepData | null;
  isGenerating: boolean;
  error?: string | null;
  onGenerate: () => void;
  isTailoredResume: boolean;
  canGenerate?: boolean;
  unavailableMessage?: string | null;
  /** Keys practice marks and notes in this browser; none are kept without it. */
  resumeId?: string | null;
  className?: string;
}

/**
 * The right half of interview prep: practice. Before generation, the prompt to
 * generate, on the cross field. After it, only the questions, in two groups, each
 * with its answer points closed (try first), a Practised mark and a note.
 */
export function InterviewPrepView({
  interviewPrep,
  isGenerating,
  error,
  onGenerate,
  isTailoredResume,
  canGenerate = true,
  unavailableMessage,
  resumeId,
  className,
}: InterviewPrepViewProps) {
  const { t } = useTranslations();
  const [practice, setPractice] = React.useState<InterviewPractice>(EMPTY_PRACTICE);

  // Read after mount: the server render has no storage.
  // Read after mount (the server render has no storage), and again when the
  // questions change: a regenerate clears the stored marks first.
  React.useEffect(() => {
    setPractice(resumeId ? readInterviewPractice(resumeId) : EMPTY_PRACTICE);
  }, [resumeId, interviewPrep]);

  if (!interviewPrep) {
    const ready = isTailoredResume && canGenerate;
    return (
      <div className={cn(ready && 'p-6', className)}>
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
            variant={ready ? 'field' : 'plain'}
            isGenerating={isGenerating}
            onGenerate={onGenerate}
            isTailoredResume={isTailoredResume}
          />
        )}
      </div>
    );
  }

  const groups: Array<{ key: string; title: string; items: InterviewPrepQuestion[] }> = [
    {
      key: 'resume',
      title: t('interviewPrep.sections.resumeQuestions'),
      items: interviewPrep.resume_questions,
    },
    {
      key: 'project',
      title: t('interviewPrep.sections.projectFollowUps'),
      items: interviewPrep.project_follow_ups,
    },
  ];
  const allKeys = groups.flatMap((g) => g.items.map((q) => practiceKey(g.key, q.question)));
  const done = allKeys.filter((key) => practice.practised.includes(key)).length;

  // Stores only marks and notes for the questions on screen, so none outlive them.
  const update = (next: InterviewPractice) => {
    const kept: InterviewPractice = {
      practised: next.practised.filter((key) => allKeys.includes(key)),
      notes: Object.fromEntries(
        Object.entries(next.notes).filter(([key, note]) => note && allKeys.includes(key))
      ),
    };
    setPractice(kept);
    if (resumeId) writeInterviewPractice(resumeId, kept);
  };

  return (
    <div className={cn('space-y-6 p-6', className)}>
      {error && <Alert tone="error">{error}</Alert>}
      {isTailoredResume && !canGenerate && (
        <Alert tone="warning">
          {unavailableMessage ?? t('interviewPrep.missingContextDescription')}
        </Alert>
      )}

      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-serif text-xl font-bold text-ink">
            {t('interviewPrep.practice.title')}
          </h2>
          <p className="font-mono text-xs uppercase tracking-wide text-ink-soft tabular-nums">
            {t('interviewPrep.practice.progress', { done, total: allKeys.length })}
          </p>
        </div>
        <p className="text-xs text-steel">{t('interviewPrep.practice.localNote')}</p>
      </div>

      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <section key={group.key} className="space-y-2">
            <h3 className={LABEL}>{group.title}</h3>
            <ul className="divide-y divide-ink border border-ink bg-white">
              {group.items.map((item, index) => {
                const key = practiceKey(group.key, item.question);
                return (
                  <QuestionRow
                    key={key}
                    id={`interview-${group.key}-${index}`}
                    item={item}
                    practised={practice.practised.includes(key)}
                    note={practice.notes[key] ?? ''}
                    onPractised={(value) =>
                      update({
                        ...practice,
                        practised: value
                          ? [...practice.practised.filter((k) => k !== key), key]
                          : practice.practised.filter((k) => k !== key),
                      })
                    }
                    onNote={(value) =>
                      update({ ...practice, notes: { ...practice.notes, [key]: value } })
                    }
                  />
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
