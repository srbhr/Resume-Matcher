'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Wand2 } from 'lucide-react';
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
  /** Pre-fetched result passed in from the Chrome extension flow */
  initialResult?: ATSScreeningResult;
  /** Auto-expand the optimization panel (set by ?optimize=1 URL param) */
  autoShowOptimization?: boolean;
}

export function ATSScreenPanel({
  resumeId,
  jobId,
  jobDescription,
  resumeText,
  initialResult,
  autoShowOptimization,
}: ATSScreenPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ATSScreeningResult | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);
  const [savedResumeId, setSavedResumeId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Whether the optimization panel is visible
  const [showOptimization, setShowOptimization] = useState(false);
  // Whether we are fetching optimization (when optimized_resume wasn't in the initial result)
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  // Sync when initialResult arrives asynchronously (URL params parsed after mount)
  useEffect(() => {
    if (initialResult) setResult(initialResult);
  }, [initialResult]);

  // Auto-open optimization panel when signalled by URL param
  useEffect(() => {
    if (autoShowOptimization && result) {
      setShowOptimization(true);
    }
  }, [autoShowOptimization, result]);

  // ── Run ATS screen ────────────────────────────────────────────────────────────
  const handleRun = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setSavedResumeId(null);
    setShowOptimization(false);
    setOptimizeError(null);
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

  // ── Create ATS Tailored Resume ────────────────────────────────────────────────
  const handleCreateTailored = async () => {
    if (!result) return;

    // Already have optimized_resume — just reveal the panel
    if (result.optimized_resume) {
      setShowOptimization(true);
      return;
    }

    // optimized_resume was stripped (URL flow) or unavailable — re-run to fetch it
    setIsOptimizing(true);
    setOptimizeError(null);

    try {
      const data = await screenResume({
        resume_id: resumeId,
        resume_text: resumeText,
        job_id: jobId,
        job_description: jobDescription,
        save_optimized: false,
      });
      setResult(data);
      if (data.optimized_resume) {
        setShowOptimization(true);
      } else {
        setOptimizeError(
          'Optimization requires a stored resume (not available in paste mode).'
        );
      }
    } catch (err: unknown) {
      setOptimizeError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  const canRun =
    (Boolean(resumeId) || Boolean(resumeText?.trim())) &&
    (Boolean(jobId) || Boolean(jobDescription?.trim()));

  // Show "Create ATS Tailored Resume" only for stored resumes (optimization requires structured JSON)
  const canOptimize = Boolean(resumeId) || Boolean(result?.optimized_resume);

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

      {/* Screen error */}
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

          {/* Create ATS Tailored Resume button */}
          {canOptimize && !showOptimization && (
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleCreateTailored}
                disabled={isOptimizing}
                className="font-mono text-xs uppercase tracking-widest bg-gradient-to-r from-blue-700 to-violet-600 hover:from-blue-800 hover:to-violet-700 text-white border-0"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating tailored resume...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Create ATS Tailored Resume
                  </>
                )}
              </Button>
              {optimizeError && (
                <p className="font-mono text-xs text-red-600">{optimizeError}</p>
              )}
            </div>
          )}

          {/* Optimization panel (suggestions + optimized resume) */}
          {showOptimization && result.optimized_resume && (
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
