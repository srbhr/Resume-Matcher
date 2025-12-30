'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, FileText, Mail, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GeneratePromptProps {
  /** Type of content to generate */
  type: 'cover-letter' | 'outreach';
  /** Whether generation is in progress */
  isGenerating: boolean;
  /** Callback to trigger generation */
  onGenerate: () => void;
  /** Whether this is a tailored resume (has job context) */
  isTailoredResume: boolean;
  /** Additional class names */
  className?: string;
}

export function GeneratePrompt({
  type,
  isGenerating,
  onGenerate,
  isTailoredResume,
  className,
}: GeneratePromptProps) {
  const isOutreach = type === 'outreach';
  const Icon = isOutreach ? Mail : FileText;
  const title = isOutreach ? 'Outreach Message' : 'Cover Letter';

  // Show a different message if resume is not tailored
  if (!isTailoredResume) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center min-h-[400px] p-12 text-center',
          className
        )}
      >
        <div className="w-16 h-16 border-2 border-gray-300 bg-gray-100 flex items-center justify-center mb-6">
          <Icon className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-gray-600 mb-3">
          {title} Not Available
        </h3>
        <p className="font-mono text-xs text-gray-500 max-w-md mb-6 leading-relaxed">
          {title}s can only be generated for tailored resumes.
          <br />
          Go to the Dashboard and tailor this resume to a job description first.
        </p>
        <div className="flex items-center gap-2 text-blue-700 font-mono text-xs">
          <span>Go to Dashboard</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-[400px] p-12 text-center',
        className
      )}
    >
      <div className="w-16 h-16 border-2 border-blue-700 bg-blue-50 flex items-center justify-center mb-6">
        <Icon className="w-8 h-8 text-blue-700" />
      </div>
      <h3 className="font-mono text-sm font-bold uppercase tracking-wider mb-3">
        Generate {title}
      </h3>
      <p className="font-mono text-xs text-gray-600 max-w-md mb-6 leading-relaxed">
        {isOutreach
          ? 'Create a personalized cold outreach message based on your resume and the job description.'
          : 'Create a tailored cover letter based on your resume and the job description.'}
      </p>
      <Button onClick={onGenerate} disabled={isGenerating} className="gap-2">
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate {title}
          </>
        )}
      </Button>
      <p className="font-mono text-xs text-gray-400 mt-4">
        {isOutreach
          ? 'Creates a brief, genuine networking message for LinkedIn or email.'
          : 'Creates a professional cover letter highlighting your relevant qualifications.'}
      </p>
    </div>
  );
}
