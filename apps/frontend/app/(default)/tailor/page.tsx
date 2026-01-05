'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { uploadJobDescriptions, improveResume } from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import { Loader2, ArrowLeft, AlertTriangle, Settings } from 'lucide-react';

export default function TailorPage() {
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);

  const router = useRouter();
  const { setImprovedData } = useResumePreview();
  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementJobs,
    incrementImprovements,
    incrementResumes,
  } = useStatusCache();

  // Check if LLM is configured
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;

  useEffect(() => {
    const storedId = localStorage.getItem('master_resume_id');
    if (!storedId) {
      router.push('/dashboard');
    } else {
      setMasterResumeId(storedId);
    }
  }, [router]);

  const handleGenerate = async () => {
    if (!jobDescription.trim() || !masterResumeId) return;

    // Validation: Check for minimum length (e.g. 50 chars) to ensure it's a valid JD
    if (jobDescription.trim().length < 50) {
      setError('Job description is too short. Please provide more details.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Upload Job Description
      // The API expects an array of strings
      const jobId = await uploadJobDescriptions([jobDescription], masterResumeId);
      incrementJobs(); // Update cached counter

      // 2. Improve Resume
      const result = await improveResume(masterResumeId, jobId);
      incrementImprovements(); // Update cached counter
      incrementResumes(); // New tailored resume created

      // 3. Store in Context
      setImprovedData(result);

      // 4. Redirect to the NEW Viewer page with the new resume ID
      // Assuming the result contains the new resume ID in data.resume_id
      if (result?.data?.resume_id) {
        router.push(`/resumes/${result.data.resume_id}`);
      } else {
        // Fallback if ID is missing for some reason
        router.push('/builder');
      }
    } catch (err) {
      console.error(err);
      // Check for common error patterns
      const errorMessage = err instanceof Error ? err.message : '';
      if (
        errorMessage.toLowerCase().includes('api key') ||
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('authentication') ||
        errorMessage.includes('401')
      ) {
        setError('API key error. Please check your LLM configuration in Settings.');
      } else if (
        errorMessage.toLowerCase().includes('rate limit') ||
        errorMessage.includes('429')
      ) {
        setError('Rate limit reached. Please wait a moment and try again.');
      } else {
        setError('Failed to generate resume. Please check your settings and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F0E8] flex flex-col items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-3xl bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] p-8 md:p-12 relative">
        {/* Back Button */}
        <Button variant="link" className="absolute top-4 left-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="mb-8 mt-4 text-center">
          <h1 className="font-serif text-4xl font-bold uppercase tracking-tight mb-2">
            Tailor Your Resume
          </h1>
          <p className="font-mono text-sm text-blue-700 font-bold uppercase">
            {'// Paste Job Description Below'}
          </p>
        </div>

        {/* LLM Not Configured Warning */}
        {!statusLoading && !isLlmConfigured && (
          <div className="mb-6 border-2 border-amber-500 bg-amber-50 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-mono text-sm font-bold uppercase tracking-wider text-amber-800">
                  [ SETUP REQUIRED ]
                </p>
                <p className="font-mono text-xs text-amber-700 mt-1">
                  {'>'} No API key configured. Resume tailoring requires an LLM provider.
                </p>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 mt-3 text-amber-700 hover:text-amber-900 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase underline">
                    Configure API Key
                  </span>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="relative">
            <Textarea
              placeholder="Paste the full job description here..."
              className="min-h-[300px] font-mono text-sm bg-gray-50 border-2 border-black focus:ring-0 focus:border-blue-700 resize-none p-4 rounded-none shadow-inner"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              disabled={isLoading}
            />
            <div className="absolute bottom-2 right-2 text-xs font-mono text-gray-400 pointer-events-none">
              {jobDescription.length} chars
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-mono flex items-center gap-2">
              <span>!</span> {error}
            </div>
          )}

          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={isLoading || !jobDescription.trim() || !isLlmConfigured}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : !isLlmConfigured ? (
              'Configure API Key First'
            ) : (
              'Generate Tailored Resume'
            )}
          </Button>
        </div>

        {/* Footer Info */}
        <div className="mt-8 pt-8 border-t border-gray-100 text-center">
          <p className="text-xs font-mono text-gray-400">AI-POWERED OPTIMIZATION ENGINE</p>
        </div>
      </div>
    </div>
  );
}
