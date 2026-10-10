'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import type { ATSScore, ATSSubScores } from '@/components/common/resume_previewer_context';
import { isTwoColumnTemplate, type TemplateType } from '@/lib/types/template-settings';

interface ATSScoreCardProps {
  atsScore: ATSScore;
  /** Template the resume will be exported with; drives the layout warning. */
  template?: TemplateType;
}

const SUB_SCORE_LABEL_KEYS: Record<keyof ATSSubScores, string> = {
  keyword_match: 'tailor.atsScore.keywordMatch',
  skills_coverage: 'tailor.atsScore.skillsCoverage',
  title_match: 'tailor.atsScore.titleMatch',
  section_completeness: 'tailor.atsScore.sectionCompleteness',
  date_consistency: 'tailor.atsScore.dateConsistency',
};

function scoreColor(value: number): string {
  if (value >= 80) return 'text-success';
  if (value >= 60) return 'text-warning';
  return 'text-destructive';
}

function barColor(value: number): string {
  if (value >= 80) return 'bg-success';
  if (value >= 60) return 'bg-warning';
  return 'bg-destructive';
}

function clampWidth(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;
}

function ScoreBar({ value, height }: { value: number; height: string }) {
  return (
    <div className={`w-full border border-black bg-paper-tint ${height}`}>
      <div
        className={`h-full transition-all duration-500 ${barColor(value)}`}
        style={{ width: `${clampWidth(value)}%` }}
      />
    </div>
  );
}

function SubScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
        <span className={`font-mono text-sm font-bold tabular-nums ${scoreColor(value)}`}>
          {Number.isFinite(value) ? value.toFixed(1) : '—'}%
        </span>
      </div>
      <ScoreBar value={value} height="h-2" />
    </div>
  );
}

function KeywordList({
  title,
  keywords,
  chipClassName,
}: {
  title: string;
  keywords: string[];
  chipClassName: string;
}) {
  return (
    <div>
      <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw, i) => (
          <span
            key={`${i}-${kw}`}
            className={`font-mono text-xs border px-2 py-0.5 rounded-none ${chipClassName}`}
          >
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ATSScoreCard({ atsScore, template }: ATSScoreCardProps) {
  const { t } = useTranslations();
  const { overall_score, sub_scores, missing_keywords, injectable_keywords, recommendations } =
    atsScore;

  return (
    <div className="border-2 border-black bg-white p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-primary"></div>
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
            {t('tailor.atsScore.title')}
          </h3>
        </div>
        <div className="flex items-end gap-1">
          <span
            className={`font-mono text-3xl font-bold tabular-nums ${scoreColor(overall_score)}`}
          >
            {overall_score.toFixed(1)}
          </span>
          <span className="font-mono text-sm text-ink-soft mb-0.5">/100</span>
        </div>
      </div>

      <ScoreBar value={overall_score} height="h-3" />

      {/* Sub-score breakdown (unscored components are null and hidden) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.keys(SUB_SCORE_LABEL_KEYS) as (keyof ATSSubScores)[]).map((key) => {
          const value = sub_scores[key];
          if (value == null) return null;
          return <SubScoreRow key={key} label={t(SUB_SCORE_LABEL_KEYS[key])} value={value} />;
        })}
      </div>

      {template && isTwoColumnTemplate(template) && (
        <div className="border-2 border-warning bg-[#FFF7ED] p-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="font-mono text-xs text-[#C2410C]">
            {t('tailor.atsScore.twoColumnWarning')}
          </p>
        </div>
      )}

      {missing_keywords.length > 0 && (
        <KeywordList
          title={t('tailor.atsScore.missingKeywords')}
          keywords={missing_keywords}
          chipClassName="border-destructive bg-[#FEF2F2] text-destructive"
        />
      )}

      {injectable_keywords.length > 0 && (
        <KeywordList
          title={t('tailor.atsScore.injectableKeywords')}
          keywords={injectable_keywords}
          chipClassName="border-primary bg-[#EFF6FF] text-primary"
        />
      )}

      {recommendations.length > 0 && (
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
            {t('tailor.atsScore.recommendations')}
          </p>
          <ul className="space-y-1.5">
            {recommendations.map((tip, i) => (
              <li key={`rec-${i}-${tip.slice(0, 30)}`} className="flex gap-2 text-sm">
                <span className="text-primary shrink-0" aria-hidden="true">
                  ■
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
