'use client';

import type { ResumeData } from '@/components/dashboard/resume-component';
import type { WritingFinding, WritingReport } from '@/lib/api/writing';
import { useTranslations } from '@/lib/i18n';
import { lineAt, locatePath } from '@/lib/utils/resume-paths';
import { cn } from '@/lib/utils';

interface WritingScoreCardProps {
  writing: WritingReport;
  /** The resume the paths point into; used to name each line. */
  resume?: ResumeData | null;
}

type Band = 'high' | 'mid' | 'low';
const band = (value: number): Band => (value >= 80 ? 'high' : value >= 60 ? 'mid' : 'low');
const BAND_TEXT: Record<Band, string> = {
  high: 'text-success',
  mid: 'text-warning-text',
  low: 'text-destructive',
};

/** Writing score from the code rules, the lines to fix and the AI reviewer's notes. */
export function WritingScoreCard({ writing, resume }: WritingScoreCardProps) {
  const { t } = useTranslations();
  const { score, before_score, findings, critic_notes, rewritten_paths, rejected_rewrites } =
    writing;

  const byPath = new Map<string, WritingFinding[]>();
  for (const finding of findings) {
    byPath.set(finding.path, [...(byPath.get(finding.path) ?? []), finding]);
  }
  // Lines with something to fix first, then the ones with only suggestions.
  const lines = [...byPath.entries()].sort(
    ([, a], [, b]) =>
      Number(b.some((f) => f.severity === 'hard')) - Number(a.some((f) => f.severity === 'hard'))
  );

  const where = (path: string) => {
    const location = locatePath(resume, path);
    if (location.kind === 'summary') return t('tailor.forceKeywords.where.summary');
    if (location.kind === 'bullet')
      return t('tailor.forceKeywords.where.bullet', { entry: location.entry, line: location.line });
    return path;
  };

  return (
    <section
      aria-labelledby="writing-score-heading"
      className="space-y-6 border border-ink bg-white p-6 shadow-sw-nested"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="writing-score-heading" className="font-serif text-xl font-bold text-ink">
            {t('tailor.writingScore.title')}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{t('tailor.writingScore.scoreNote')}</p>
        </div>
        {score != null && (
          <p className="flex items-end gap-2">
            {before_score != null && before_score !== score && (
              <span className="mb-1 font-mono text-sm tabular-nums text-ink-soft">
                {t('tailor.writingScore.beforeAfter', { before: before_score })}
              </span>
            )}
            <span
              className={cn('font-mono text-3xl font-bold tabular-nums', BAND_TEXT[band(score)])}
            >
              {score}
            </span>
            <span className="mb-1 font-mono text-sm text-ink-soft">/100</span>
          </p>
        )}
      </div>

      {(rewritten_paths.length > 0 || rejected_rewrites > 0) && (
        <ul className="space-y-1 font-mono text-xs uppercase tracking-wider text-ink-soft">
          {rewritten_paths.length > 0 && (
            <li>{t('tailor.writingScore.rewritten', { count: rewritten_paths.length })}</li>
          )}
          {rejected_rewrites > 0 && (
            <li>{t('tailor.writingScore.rejected', { count: rejected_rewrites })}</li>
          )}
        </ul>
      )}

      {lines.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('tailor.writingScore.noFindings')}</p>
      ) : (
        <div>
          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-ink-soft">
            {t('tailor.writingScore.findingsTitle')}
          </p>
          <ul className="space-y-3">
            {lines.map(([path, lineFindings]) => (
              <li key={path} className="border border-ink bg-paper p-3">
                <p className="font-mono text-xs uppercase tracking-wider text-ink-soft">
                  {where(path)}
                </p>
                <p className="mt-1 text-sm text-ink">
                  {lineAt(resume, path) ?? lineFindings[0].excerpt}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {lineFindings.map((finding) => (
                    <li
                      key={finding.rule}
                      className={cn(
                        'border px-2 py-1 font-mono text-xs',
                        finding.severity === 'hard'
                          ? 'border-destructive bg-destructive-tint text-destructive'
                          : 'border-ink bg-white text-ink-soft'
                      )}
                    >
                      <span className="sr-only">
                        {t(`tailor.writingScore.severity.${finding.severity}`)}:{' '}
                      </span>
                      {t(`tailor.writingScore.rules.${finding.rule}`)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {critic_notes.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-ink-soft">
            {t('tailor.writingScore.notesTitle')}
          </p>
          <ul className="space-y-2">
            {critic_notes.map((note) => (
              <li key={note.path} className="text-sm text-ink-soft">
                <span className="font-mono text-xs uppercase tracking-wider text-ink">
                  {where(note.path)}
                </span>{' '}
                {note.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
