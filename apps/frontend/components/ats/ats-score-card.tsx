'use client';

import React from 'react';
import type { ScoreBreakdown, ATSDecision } from '@/lib/api/ats';

interface ATSScoreCardProps {
  score: ScoreBreakdown;
  decision: ATSDecision;
}

const DECISION_STYLES: Record<ATSDecision, { bg: string; text: string; label: string }> = {
  PASS: { bg: 'bg-green-700', text: 'text-white', label: 'PASS' },
  BORDERLINE: { bg: 'bg-amber-500', text: 'text-black', label: 'BORDERLINE' },
  REJECT: { bg: 'bg-red-600', text: 'text-white', label: 'REJECT' },
};

const SCORE_DIMS = [
  { key: 'skills_match' as const, label: 'Skills Match', max: 30 },
  { key: 'experience_match' as const, label: 'Experience', max: 25 },
  { key: 'domain_match' as const, label: 'Domain', max: 20 },
  { key: 'tools_match' as const, label: 'Tools', max: 15 },
  { key: 'achievement_match' as const, label: 'Achievements', max: 10 },
];

export function ATSScoreCard({ score, decision }: ATSScoreCardProps) {
  const style = DECISION_STYLES[decision];

  return (
    <div className="border border-black p-6 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1">
            ATS Score
          </p>
          <p className="font-serif text-6xl font-bold text-black">
            {Math.round(score.total)}
            <span className="text-2xl text-muted-foreground">/100</span>
          </p>
        </div>
        <div className={`${style.bg} ${style.text} px-6 py-3 font-mono text-lg font-bold uppercase tracking-widest border border-black`}>
          {style.label}
        </div>
      </div>

      <div className="space-y-3">
        {SCORE_DIMS.map(({ key, label, max }) => {
          const value = score[key];
          const pct = Math.round((value / max) * 100);
          return (
            <div key={key}>
              <div className="flex justify-between font-mono text-xs uppercase mb-1">
                <span>{label}</span>
                <span>{Math.round(value)}/{max}</span>
              </div>
              <div className="h-2 bg-secondary border border-black">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
