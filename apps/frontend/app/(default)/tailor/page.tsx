'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { uploadJobDescriptions, improveResume } from '@/lib/api/resume';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function TailorPage() {
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);

  const router = useRouter();
  const { setImprovedData } = useResumePreview();

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

      // 2. Improve Resume
      const result = await improveResume(masterResumeId, jobId);

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
      setError('Failed to generate resume. Please try again.');
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
            disabled={isLoading || !jobDescription.trim()}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
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
