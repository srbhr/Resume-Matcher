'use client';

import type { ATSScore } from '@/components/common/resume_previewer_context';

interface ATSScoreCardProps {
  atsScore: ATSScore;
}

const SUB_SCORE_LABELS: Record<string, string> = {
  keyword_match: 'Keyword Match',
  skills_coverage: 'Skills Coverage',
  section_completeness: 'Section Completeness',
};

function scoreColor(value: number): string {
  if (value >= 80) return 'text-green-400';
  if (value >= 60) return 'text-yellow-400';
  return 'text-red-400';
}

function barColor(value: number): string {
  if (value >= 80) return 'bg-green-500';
  if (value >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

function clampWidth(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0;
}

function SubScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-gray-300">{label}</span>
        <span className={`text-sm font-semibold tabular-nums ${scoreColor(value)}`}>
          {Number.isFinite(value) ? value.toFixed(1) : '—'}%
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${barColor(value)}`}
          style={{ width: `${clampWidth(value)}%` }}
        />
      </div>
    </div>
  );
}

export function ATSScoreCard({ atsScore }: ATSScoreCardProps) {
  const { overall_score, sub_scores, missing_keywords, injectable_keywords, recommendations } =
    atsScore;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">ATS Score Breakdown</h3>
        <div className="flex items-end gap-1">
          <span className={`text-3xl font-bold tabular-nums ${scoreColor(overall_score)}`}>
            {overall_score.toFixed(1)}
          </span>
          <span className="text-gray-400 text-sm mb-0.5">/100</span>
        </div>
      </div>

      {/* Overall bar */}
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${barColor(overall_score)}`}
          style={{ width: `${clampWidth(overall_score)}%` }}
        />
      </div>

      {/* Sub-score breakdown */}
      <div className="space-y-3">
        {Object.entries(sub_scores).map(([key, value]) => (
          <SubScoreRow key={key} label={SUB_SCORE_LABELS[key] ?? key} value={value} />
        ))}
      </div>

      {/* Missing keywords */}
      {missing_keywords.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Missing Keywords
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing_keywords.map((kw, i) => (
              <span
                key={`missing-${i}-${kw}`}
                className="text-xs bg-red-900/40 border border-red-700/50 text-red-300 rounded px-2 py-0.5"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Injectable keywords */}
      {injectable_keywords.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Safe to Add (in your master resume)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {injectable_keywords.map((kw, i) => (
              <span
                key={`injectable-${i}-${kw}`}
                className="text-xs bg-blue-900/40 border border-blue-700/50 text-blue-300 rounded px-2 py-0.5"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Recommendations
          </p>
          <ul className="space-y-1.5">
            {recommendations.map((tip, i) => (
              <li key={`rec-${i}-${tip.slice(0, 30)}`} className="flex gap-2 text-sm text-gray-300">
                <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
