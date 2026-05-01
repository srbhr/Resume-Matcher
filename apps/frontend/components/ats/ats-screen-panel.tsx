'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { screenResume, type ATSScreeningResult } from '@/lib/api/ats';
import { ATSScoreCard } from './ats-score-card';
import { ATSKeywordTable } from './ats-keyword-table';
import { ATSMissingKeywords } from './ats-missing-keywords';
import { ATSWarningFlags } from './ats-warning-flags';
import { ATSOptimizationPanel } from './ats-optimization-panel';

interface ATSScreenPanelProps {
  /** Stored resume ID (from tailor flow) */
  resumeId?: string;
  /** Stored job ID (from tailor flow) */
  jobId?: string;
  /** Raw JD text (from standalone mode) */
  jobDescription?: string;
  /** Raw resume text (from standalone mode) */
  resumeText?: string;
  /** Pre-fetched result passed in from the Chrome extension "View Full Results" flow */
  initialResult?: ATSScreeningResult;
}

export function ATSScreenPanel({
  resumeId,
  jobId,
  jobDescription,
  resumeText,
  initialResult,
}: ATSScreenPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ATSScreeningResult | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);

  // Sync when initialResult arrives asynchronously (e.g. parsed from URL params after mount)
  useEffect(() => {
    if (initialResult) setResult(initialResult);
  }, [initialResult]);
  const [savedResumeId, setSavedResumeId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const handleRun = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setSavedResumeId(null);
    setElapsed(0);

    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const data = await screenResume({
        resume_id: resumeId,
        resume_text: resumeText,
        job_id: jobId,
        job_description: jobDescription,
        save_optimized: false,
      });
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ATS screening failed');
    } finally {
      clearInterval(timer);
      setIsLoading(false);
    }
  };

  const canRun =
    (Boolean(resumeId) || Boolean(resumeText?.trim())) &&
    (Boolean(jobId) || Boolean(jobDescription?.trim()));

  return (
    <div className="space-y-6">
      {/* Run button */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleRun}
          disabled={isLoading || !canRun}
          className="font-mono text-xs uppercase tracking-widest"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing... {elapsed > 0 && `(${elapsed}s)`}
            </>
          ) : (
            'Run ATS Screen'
          )}
        </Button>
        {!canRun && (
          <p className="font-mono text-xs text-muted-foreground">
            Resume and job description are required.
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-600 bg-red-50 px-4 py-3 font-mono text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <ATSScoreCard score={result.score} decision={result.decision} />
          <ATSKeywordTable rows={result.keyword_table} />
          <ATSMissingKeywords keywords={result.missing_keywords} />
          <ATSWarningFlags flags={result.warning_flags} />

          {result.optimized_resume && (
            <ATSOptimizationPanel
              suggestions={result.optimization_suggestions}
              optimizedResume={result.optimized_resume}
              resumeId={resumeId ?? null}
              jobId={jobId ?? null}
              jobDescription={jobDescription ?? null}
              resumeText={resumeText ?? null}
              onSaved={(id) => setSavedResumeId(id)}
            />
          )}

          {savedResumeId && (
            <div className="border border-green-700 bg-green-50 px-4 py-3 font-mono text-sm text-green-800">
              Optimized resume saved. Resume ID: {savedResumeId}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
