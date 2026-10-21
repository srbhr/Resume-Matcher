'use client';

import { Check, SpinnerGap } from '@phosphor-icons/react';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type TailorStep =
  | 'keywords'
  | 'select'
  | 'plan'
  | 'tailor'
  | 'refine'
  | 'critique'
  | 'rewrite'
  | 'verify';

const STEPS: TailorStep[] = [
  'keywords',
  'select',
  'plan',
  'tailor',
  'refine',
  'critique',
  'rewrite',
  'verify',
];

/** Backend stage names (progress["stage"]) grouped into the steps the user sees. */
const STAGE_TO_STEP: Record<string, TailorStep> = {
  load_job_keywords: 'keywords',
  load_original_resume: 'keywords',
  select_bullets: 'select',
  plan_skill_targets: 'plan',
  generate_resume_diffs: 'tailor',
  apply_resume_diffs: 'tailor',
  generate_resume: 'tailor',
  preserve_source_fields: 'tailor',
  refine_resume: 'refine',
  critique_writing: 'critique',
  rewrite_writing: 'rewrite',
  final_page_check: 'verify',
  register_preview: 'verify',
  calculate_diff: 'verify',
  serialize_preview: 'verify',
};

/** After this many seconds the list explains that slow models are normal. */
export const SLOW_AFTER_SECONDS = 30;

interface TailorProgressProps {
  /** Latest backend stage, or null before the first update arrives. */
  stage: string | null;
  elapsed: number;
  /** The run selects bullets first (page limit or bullet cap). */
  withSelection: boolean;
  /** The run rewrites weak lines (every mode except Light nudge). */
  withRewrite: boolean;
  /** Only part of the pipeline runs (e.g. Improve writing in the Builder). */
  steps?: TailorStep[];
}

/** The live pipeline as a step list: done, in progress, waiting. */
export function TailorProgress({
  stage,
  elapsed,
  withSelection,
  withRewrite,
  steps,
}: TailorProgressProps) {
  const { t } = useTranslations();
  const visible = (steps ?? STEPS).filter(
    (step) => (step !== 'select' || withSelection) && (step !== 'rewrite' || withRewrite)
  );
  const step = stage ? STAGE_TO_STEP[stage] : undefined;
  const current = Math.max(0, step ? visible.indexOf(step) : 0);

  return (
    <section
      aria-labelledby="tailor-progress-heading"
      className="space-y-3 border border-ink bg-white p-4 shadow-sw-nested"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="tailor-progress-heading"
          className="font-mono text-xs font-bold uppercase tracking-wider text-ink"
        >
          {t('tailor.progress.title')}
        </h2>
        <span className="font-mono text-xs tabular-nums text-ink-soft">
          {t('tailor.progress.elapsed', { seconds: elapsed })}
        </span>
      </div>
      <ol className="space-y-2">
        {visible.map((name, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'pending';
          return (
            <li
              key={name}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex items-center gap-3"
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center border',
                  state === 'done' && 'border-success bg-success-tint text-success',
                  state === 'current' && 'border-ink bg-ink text-white',
                  state === 'pending' && 'border-panel-hover bg-paper text-ink-soft'
                )}
              >
                {state === 'done' ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : state === 'current' ? (
                  <SpinnerGap className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <span className="font-mono text-xs tabular-nums">{index + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  'text-sm',
                  state === 'current' ? 'font-bold text-ink' : 'text-ink-soft'
                )}
              >
                {t(`tailor.progress.steps.${name}`)}
                <span className="sr-only"> ({t(`tailor.progress.state.${state}`)})</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="text-sm text-ink-soft">
        {elapsed >= SLOW_AFTER_SECONDS ? t('tailor.progress.slow') : ''}
      </p>
    </section>
  );
}
