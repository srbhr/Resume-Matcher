'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { ATSResumeInput, type ResumeInputValue } from '@/components/ats/ats-resume-input';
import { ATSScreenPanel } from '@/components/ats/ats-screen-panel';
import type { ATSScreeningResult } from '@/lib/api/ats';

// Inner component that uses useSearchParams — must be wrapped in <Suspense>
function ATSPageContent() {
  const searchParams = useSearchParams();

  const [resumeInput, setResumeInput] = useState<ResumeInputValue>({
    resumeId: null,
    resumeText: null,
  });
  const [jobDescription, setJobDescription] = useState('');
  const [initialResult, setInitialResult] = useState<ATSScreeningResult | undefined>(undefined);
  const [autoShowOptimization, setAutoShowOptimization] = useState(false);
  const [jobTitle, setJobTitle] = useState<string | undefined>(undefined);
  const [company, setCompany] = useState<string | undefined>(undefined);

  // Pre-fill from URL params set by the Chrome extension.
  // Reset ALL state on every searchParams change so navigating between
  // different ?jd= URLs never shows stale inputs or results.
  useEffect(() => {
    const jd       = searchParams.get('jd') ?? '';
    const resumeId = searchParams.get('resumeId');
    const jt       = searchParams.get('jobTitle') ?? undefined;
    const co       = searchParams.get('company')  ?? undefined;

    setJobDescription(jd);
    setResumeInput(resumeId ? { resumeId, resumeText: null } : { resumeId: null, resumeText: null });
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

  return (
    <div
      className="min-h-screen w-full flex justify-center items-start py-12 px-4 md:px-8 bg-background"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="w-full max-w-4xl border border-black bg-background shadow-sw-lg">
        {/* Header */}
        <div className="border-b border-black p-8 md:p-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-black transition-colors mb-4"
          >
            ← Home
          </Link>
          <h1 className="font-serif text-4xl md:text-5xl text-black tracking-tight uppercase">
            ATS Screen
          </h1>
          <p className="mt-3 text-sm font-mono text-blue-700 uppercase tracking-wide font-bold">
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

            {/* Job description input */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-widest font-bold">
                Job Description
              </label>
              <Textarea
                placeholder="Paste the job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={12}
                className="font-mono text-sm border-black"
              />
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
