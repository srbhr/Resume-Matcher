'use client';

import type { ATSScore, ATSSubScores } from '@/components/common/resume_previewer_context';
import { Alert } from '@/components/ui/alert';
import { useTranslations } from '@/lib/i18n';
import { isTwoColumnTemplate, type TemplateType } from '@/lib/types/template-settings';
import { cn } from '@/lib/utils';

interface ATSScoreCardProps {
  atsScore: ATSScore;
  /** Template the resume will be exported with; drives the layout warning. */
  template?: TemplateType;
}

// Display order; title_match and date_consistency are null when they couldn't be scored.
const SUB_SCORE_LABEL_KEYS: Record<keyof ATSSubScores, string> = {
  keyword_match: 'tailor.atsScore.keywordMatch',
  skills_coverage: 'tailor.atsScore.skillsCoverage',
  title_match: 'tailor.atsScore.titleMatch',
  section_completeness: 'tailor.atsScore.sectionCompleteness',
  date_consistency: 'tailor.atsScore.dateConsistency',
};

type Band = 'high' | 'mid' | 'low';
const band = (value: number): Band => (value >= 80 ? 'high' : value >= 60 ? 'mid' : 'low');
const BAND_TEXT: Record<Band, string> = {
  high: 'text-success',
  mid: 'text-warning-text',
  low: 'text-destructive',
};
const BAND_FILL: Record<Band, string> = {
  high: 'bg-success',
  mid: 'bg-warning',
  low: 'bg-destructive',
};
const clampWidth = (value: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full border border-ink bg-white">
      <div
        className={cn('h-full', BAND_FILL[band(value)])}
        style={{ width: `${clampWidth(value)}%` }}
      />
    </div>
  );
}

function SubScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-soft">{label}</span>
        <span className={cn('font-mono text-sm font-bold tabular-nums', BAND_TEXT[band(value)])}>
          {Number.isFinite(value) ? value.toFixed(1) : '—'}%
        </span>
      </div>
      <ScoreBar value={value} />
    </div>
  );
}

function KeywordList({
  title,
  keywords,
  tone,
}: {
  title: string;
  keywords: string[];
  tone: 'missing' | 'injectable';
}) {
  return (
    <div>
      <p className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-steel">
        {title}
      </p>
      <ul className="flex flex-wrap gap-2">
        {keywords.map((keyword, i) => (
          <li
            key={`${tone}-${i}-${keyword}`}
            className={cn(
              'border px-2 py-1 font-mono text-xs',
              tone === 'missing'
                ? 'border-destructive bg-destructive-tint text-destructive'
                : 'border-primary bg-info-tint text-primary'
            )}
          >
            {keyword}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ATSScoreCard({ atsScore, template }: ATSScoreCardProps) {
  const { t } = useTranslations();
  const { overall_score, sub_scores, missing_keywords, injectable_keywords, recommendations } =
    atsScore;
  return (
    <section className="space-y-6 border border-ink bg-white p-6 shadow-sw-default">
      <div className="flex items-end justify-between gap-4">
        <h3 className="font-serif text-xl font-bold text-ink">{t('tailor.atsScore.title')}</h3>
        <p className="flex items-end gap-1">
          <span
            className={cn(
              'font-mono text-3xl font-bold tabular-nums',
              BAND_TEXT[band(overall_score)]
            )}
          >
            {overall_score.toFixed(1)}
          </span>
          <span className="mb-1 font-mono text-sm text-steel">/100</span>
        </p>
      </div>
      <ScoreBar value={overall_score} />
      <div className="space-y-3">
        {(Object.keys(SUB_SCORE_LABEL_KEYS) as (keyof ATSSubScores)[]).map((key) => {
          const value = sub_scores[key];
          if (value == null) return null;
          return <SubScoreRow key={key} label={t(SUB_SCORE_LABEL_KEYS[key])} value={value} />;
        })}
      </div>
      {template && isTwoColumnTemplate(template) && (
        <Alert tone="warning">{t('tailor.atsScore.twoColumnWarning')}</Alert>
      )}
      {missing_keywords.length > 0 && (
        <KeywordList
          title={t('tailor.atsScore.missingKeywords')}
          keywords={missing_keywords}
          tone="missing"
        />
      )}
      {injectable_keywords.length > 0 && (
        <KeywordList
          title={t('tailor.atsScore.injectableKeywords')}
          keywords={injectable_keywords}
          tone="injectable"
        />
      )}
      {recommendations.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-steel">
            {t('tailor.atsScore.recommendations')}
          </p>
          <ul className="list-disc space-y-2 pl-4 text-sm text-ink-soft marker:text-primary">
            {recommendations.map((tip, i) => (
              <li key={`rec-${i}-${tip.slice(0, 30)}`}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
