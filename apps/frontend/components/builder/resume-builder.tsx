'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Resume, { ResumeData } from '@/components/dashboard/resume-component';
import { ResumeForm } from './resume-form';
import { Button } from '@/components/ui/button';
import { Download, Save, AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { fetchResume, updateResume } from '@/lib/api/resume';

const STORAGE_KEY = 'resume_builder_draft';

const INITIAL_DATA: ResumeData = {
  personalInfo: {
    name: 'Your Name',
    title: 'Professional Title',
    email: 'email@example.com',
    phone: '+1 234 567 890',
    location: 'City, Country',
    website: 'portfolio.com',
    linkedin: 'linkedin.com/in/you',
    github: 'github.com/you',
  },
  summary: 'A brief summary of your professional background and key achievements.',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {
    technicalSkills: [],
    languages: [],
    certificationsTraining: [],
    awards: [],
  },
};

const ResumeBuilderContent = () => {
  const [resumeData, setResumeData] = useState<ResumeData>(INITIAL_DATA);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<ResumeData>(INITIAL_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const { improvedData } = useResumePreview();
  const searchParams = useSearchParams();
  const router = useRouter();
  const resumeId = searchParams.get('id');

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const loadResumeData = async () => {
      setLoadingState('loading');

      // Priority 1: Fetch from API if ID is in URL (most reliable)
      if (resumeId) {
        try {
          const data = await fetchResume(resumeId);
          // Prefer processed_resume if available
          if (data.processed_resume) {
            setResumeData(data.processed_resume as ResumeData);
            setLastSavedData(data.processed_resume as ResumeData);
            setLoadingState('loaded');
            return;
          }
          // Fallback to parsing raw content
          if (data.raw_resume?.content) {
            try {
              const parsed = JSON.parse(data.raw_resume.content);
              setResumeData(parsed);
              setLastSavedData(parsed);
              setLoadingState('loaded');
              return;
            } catch {
              // Raw content is markdown, not JSON
            }
          }
        } catch (err) {
          console.error('Failed to load resume from API:', err);
        }
      }

      // Priority 2: Improved Data from Context (Tailor Flow)
      if (improvedData?.data?.resume_preview) {
        setResumeData(improvedData.data.resume_preview);
        setLastSavedData(improvedData.data.resume_preview);
        // Persist to localStorage as backup
        localStorage.setItem(STORAGE_KEY, JSON.stringify(improvedData.data.resume_preview));
        setLoadingState('loaded');
        return;
      }

      // Priority 3: Restore from localStorage (browser refresh recovery)
      const savedDraft = localStorage.getItem(STORAGE_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setResumeData(parsed);
          setLastSavedData(parsed);
          setHasUnsavedChanges(true); // Mark as unsaved since it's a draft
          setLoadingState('loaded');
          return;
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      // Fallback: Use initial data
      setLoadingState('loaded');
    };

    loadResumeData();
  }, [improvedData, resumeId]);

  const handleUpdate = useCallback((newData: ResumeData) => {
    setResumeData(newData);
    setHasUnsavedChanges(true);
    // Auto-save draft to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  }, []);

  const handleSave = async () => {
    if (!resumeId) {
      alert('Save is only available when editing an existing resume.');
      return;
    }
    try {
      setIsSaving(true);
      const updated = await updateResume(resumeId, resumeData);
      const nextData = (updated.processed_resume || resumeData) as ResumeData;
      setResumeData(nextData);
      setLastSavedData(nextData);
      setHasUnsavedChanges(false);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
    } catch (error) {
      console.error('Failed to save resume:', error);
      alert('Failed to save resume. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setResumeData(lastSavedData);
    setHasUnsavedChanges(false);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lastSavedData));
  };

  return (
    <div
      className="min-h-screen w-full bg-[#F0F0E8] flex justify-center items-start py-12 px-4 md:px-8"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      {/* Main Container */}
      <div className="w-full max-w-[90%] md:max-w-[95%] xl:max-w-[1800px] border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] flex flex-col">
        {/* Header Section */}
        <div className="border-b border-black p-8 md:p-12 flex flex-col md:flex-row justify-between items-start md:items-center bg-[#F0F0E8] no-print">
          <div>
            {/* Back Button */}
            <Button
              variant="ghost"
              onClick={() => router.push('/dashboard')}
              className="pl-0 hover:bg-transparent hover:text-blue-700 gap-2 mb-4 -ml-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
            <h1 className="font-serif text-4xl md:text-6xl text-black tracking-tight leading-[0.95] uppercase">
              Resume Builder
            </h1>
            <div className="mt-4 flex items-center gap-3">
              <p className="text-sm font-mono text-blue-700 uppercase tracking-wide font-bold">
                {'// '}
                {resumeId ? 'EDIT MODE' : 'CREATE & PREVIEW'}
              </p>
              {hasUnsavedChanges && (
                <span className="flex items-center gap-1 text-xs font-mono text-amber-600 bg-amber-50 px-2 py-1 border border-amber-200">
                  <AlertTriangle className="w-3 h-3" />
                  UNSAVED DRAFT
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-6 md:mt-0">
            <Button
              size="sm"
              onClick={handleReset}
              disabled={!hasUnsavedChanges}
              className={`rounded-none border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all ${
                hasUnsavedChanges
                  ? 'bg-[#F97316] text-black hover:bg-[#EA580C]'
                  : 'bg-transparent text-gray-300'
              }`}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!resumeId || isSaving}
              className="bg-blue-700 hover:bg-blue-800 text-white rounded-none border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              size="sm"
              onClick={() => window.print()}
              className="bg-green-700 text-white border-black rounded-none shadow-[2px_2px_0px_0px_#000000] hover:bg-green-800 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 bg-black gap-[1px]">
          {/* Left Panel: Editor */}
          <div className="bg-[#F0F0E8] p-6 md:p-8 h-[calc(100vh-300px)] overflow-y-auto no-print">
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="flex items-center gap-2 border-b-2 border-black pb-2 mb-6">
                <div className="w-3 h-3 bg-blue-700"></div>
                <h2 className="font-mono text-lg font-bold uppercase tracking-wider">
                  Editor Panel
                </h2>
              </div>
              <ResumeForm resumeData={resumeData} onUpdate={handleUpdate} />
            </div>
          </div>

          {/* Right Panel: Preview */}
          <div className="bg-[#E5E5E0] p-6 md:p-8 pb-10 h-[calc(100vh-300px)] overflow-y-auto relative flex flex-col items-center">
            <div className="w-full max-w-3xl mb-6 flex items-center gap-2 border-b-2 border-gray-500 pb-2 no-print">
              <div className="w-3 h-3 bg-green-700"></div>
              <h2 className="font-mono text-lg font-bold text-gray-600 uppercase tracking-wider">
                Live Preview
              </h2>
            </div>
            <div className="resume-print w-full max-w-[250mm] mb-4 shadow-[6px_6px_0px_0px_#000000] border-2 border-black bg-white">
              {/* Resume component scale wrapper */}
              <div className="resume-scale origin-top scale-[0.75] md:scale-90 lg:scale-100">
                <Resume resumeData={resumeData} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#F0F0E8] flex justify-between items-center font-mono text-xs text-blue-700 border-t border-black no-print">
          <span className="uppercase font-bold">Resume Builder Module</span>
          <span>Ready to Process</span>
        </div>
      </div>
    </div>
  );
};

export const ResumeBuilder = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResumeBuilderContent />
    </Suspense>
  );
};
