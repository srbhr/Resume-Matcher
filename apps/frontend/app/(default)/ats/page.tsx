'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { ATSResumeInput, type ResumeInputValue } from '@/components/ats/ats-resume-input';
import { ATSScreenPanel } from '@/components/ats/ats-screen-panel';
import type { ATSScreeningResult } from '@/lib/api/ats';
import { fetchJobDescription } from '@/lib/api/resume';

// Inner component that uses useSearchParams — must be wrapped in <Suspense>
function ATSPageContent() {
  const searchParams = useSearchParams();

  const [resumeInput, setResumeInput] = useState<ResumeInputValue>({
    resumeId: null,
    resumeText: null,
  });
  const [jobDescription, setJobDescription] = useState('');
  // True when the selected resume has an associated JD on file (tailored resumes).
  // Master resumes have no JD, so we fall back to the textarea.
  const [jdAutoLoaded, setJdAutoLoaded] = useState(false);
  const [initialResult, setInitialResult] = useState<ATSScreeningResult | undefined>(undefined);
  const [autoShowOptimization, setAutoShowOptimization] = useState(false);
  const [jobTitle, setJobTitle] = useState<string | undefined>(undefined);
  const [company, setCompany] = useState<string | undefined>(undefined);

  // Pre-fill from URL params set by the Chrome extension.
  // Reset ALL state on every searchParams change so navigating between
  // different ?jd= URLs never shows stale inputs or results.
  useEffect(() => {
    const jd = searchParams.get('jd') ?? '';
    const resumeId = searchParams.get('resumeId');
    const jt = searchParams.get('jobTitle') ?? undefined;
    const co = searchParams.get('company') ?? undefined;

    setJobDescription(jd);
    setResumeInput(
      resumeId ? { resumeId, resumeText: null } : { resumeId: null, resumeText: null }
    );
    setJobTitle(jt);
    setCompany(co);
    setAutoShowOptimization(searchParams.get('optimize') === '1');

    const resultParam = searchParams.get('result');
    if (resultParam) {
      try {
        setInitialResult(JSON.parse(resultParam) as ATSScreeningResult);
      } catch {
        setInitialResult(undefined);
      }
    } else {
      setInitialResult(undefined);
    }
  }, [searchParams]);

  // Auto-fill JD from the resume's associated job description whenever the
  // selected resume changes. Tailored resumes have a JD on file; the master
  // does not, so we fall back to the textarea in that case.
  useEffect(() => {
    const id = resumeInput.resumeId;
    setJdAutoLoaded(false);
    if (!id) {
      setJobDescription('');
      return;
    }
    let cancelled = false;
    fetchJobDescription(id)
      .then((jd) => {
        if (cancelled) return;
        const content = jd?.content?.trim();
        if (content) {
          setJobDescription(content);
          setJdAutoLoaded(true);
        } else {
          setJobDescription('');
        }
      })
      .catch(() => {
        if (!cancelled) setJobDescription('');
      });
    return () => {
      cancelled = true;
    };
  }, [resumeInput.resumeId]);

  return (
    <div className="min-h-screen w-full flex justify-center items-start py-12 px-4 md:px-8 bg-background grid-bg">
      <div className="w-full max-w-4xl border border-border bg-background shadow-sw-lg">
        {/* Header */}
        <div className="border-b border-border p-8 md:p-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            ← Home
          </Link>
          <h1 className="font-serif text-4xl md:text-5xl text-foreground tracking-tight uppercase">
            ATS Screen
          </h1>
          <p className="mt-3 text-sm font-mono text-primary uppercase tracking-wide font-bold">
            {'// '}
            Predict your resume pass rate before applying
          </p>
        </div>

        <div className="p-8 md:p-10 space-y-8">
          {/* Inputs */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Resume input */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-widest font-bold">
                Resume
              </label>
              <ATSResumeInput value={resumeInput} onChange={setResumeInput} />
            </div>

            {/* Job description — auto-loaded for tailored resumes, paste box for master */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-widest font-bold">
                Job Description
              </label>
              {jdAutoLoaded ? (
                <div className="border border-border bg-secondary p-3 font-mono text-xs whitespace-pre-wrap max-h-72 overflow-y-auto">
                  {jobDescription}
                </div>
              ) : (
                <Textarea
                  placeholder="Paste the job description here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={12}
                  className="font-mono text-sm border-border"
                />
              )}
            </div>
          </div>

          {/* ATS Panel (run button + results) */}
          <ATSScreenPanel
            resumeId={resumeInput.resumeId ?? undefined}
            resumeText={resumeInput.resumeText ?? undefined}
            jobDescription={jobDescription || undefined}
            initialResult={initialResult}
            autoShowOptimization={autoShowOptimization}
            jobTitle={jobTitle}
            company={company}
          />
        </div>
      </div>
    </div>
  );
}

// Suspense boundary required by Next.js 15 for useSearchParams() in client components
export default function ATSPage() {
  return (
    <Suspense>
      <ATSPageContent />
    </Suspense>
  );
}
