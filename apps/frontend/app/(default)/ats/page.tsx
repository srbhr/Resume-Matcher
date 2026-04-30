'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { ATSResumeInput, type ResumeInputValue } from '@/components/ats/ats-resume-input';
import { ATSScreenPanel } from '@/components/ats/ats-screen-panel';

export default function ATSPage() {
  const [resumeInput, setResumeInput] = useState<ResumeInputValue>({
    resumeId: null,
    resumeText: null,
  });
  const [jobDescription, setJobDescription] = useState('');

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
          />
        </div>
      </div>
    </div>
  );
}
