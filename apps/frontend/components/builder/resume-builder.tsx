'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Resume, { ResumeData } from '@/components/dashboard/resume-component';
import { ResumeForm } from './resume-form';
import { FormattingControls } from './formatting-controls';
import { Button } from '@/components/ui/button';
import { Download, Save, AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { downloadResumePdf, fetchResume, updateResume } from '@/lib/api/resume';
import { type TemplateSettings, DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

const STORAGE_KEY = 'resume_builder_draft';
const SETTINGS_STORAGE_KEY = 'resume_builder_settings';

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
  const [isDownloading, setIsDownloading] = useState(false);
  const [, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [templateSettings, setTemplateSettings] =
    useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const { improvedData } = useResumePreview();
  const searchParams = useSearchParams();
  const router = useRouter();
  const resumeId = searchParams.get('id');

  // Load template settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setTemplateSettings({ ...DEFAULT_TEMPLATE_SETTINGS, ...parsed });
      } catch {
        // Use defaults
      }
    }
  }, []);

  // Save template settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(templateSettings));
  }, [templateSettings]);

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

  const handleSettingsChange = useCallback((newSettings: TemplateSettings) => {
    setTemplateSettings(newSettings);
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

  const handleDownload = async () => {
    if (!resumeId) {
      alert('Download is only available for saved resumes.');
      return;
    }
    try {
      setIsDownloading(true);
      const blob = await downloadResumePdf(resumeId, templateSettings);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resume_${resumeId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download resume:', error);
      alert('Failed to download resume. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className="h-screen w-full bg-[#F0F0E8] flex justify-center items-center p-4 md:p-8"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      {/* Main Container */}
      <div className="w-full h-full max-w-[90%] md:max-w-[95%] xl:max-w-[1800px] border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)] flex flex-col">
        {/* Header Section */}
        <div className="border-b border-black p-6 md:p-8 bg-[#F0F0E8] no-print">
          {/* Top Row: Back button and Actions */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <Button
                variant="link"
                onClick={() => router.push('/dashboard')}
                className="mb-2 -ml-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Button>
              <h1 className="font-serif text-3xl md:text-5xl text-black tracking-tight leading-[0.95] uppercase">
                Resume Builder
              </h1>
              <div className="mt-3 flex items-center gap-3">
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

            <div className="flex gap-3 mt-4 md:mt-0">
              <Button
                variant="warning"
                size="sm"
                onClick={handleReset}
                disabled={!hasUnsavedChanges}
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!resumeId || isSaving}>
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="success"
                size="sm"
                onClick={handleDownload}
                disabled={!resumeId || isDownloading}
              >
                <Download className="w-4 h-4" />
                {isDownloading ? 'Generating...' : 'Download'}
              </Button>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 bg-black gap-[1px] flex-1 min-h-0">
          {/* Left Panel: Editor */}
          <div className="bg-[#F0F0E8] p-6 md:p-8 overflow-y-auto no-print">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex items-center gap-2 border-b-2 border-black pb-2">
                <div className="w-3 h-3 bg-blue-700"></div>
                <h2 className="font-mono text-lg font-bold uppercase tracking-wider">
                  Editor Panel
                </h2>
              </div>

              {/* Formatting Controls */}
              <FormattingControls settings={templateSettings} onChange={handleSettingsChange} />

              {/* Resume Form */}
              <ResumeForm resumeData={resumeData} onUpdate={handleUpdate} />
            </div>
          </div>

          {/* Right Panel: Preview */}
          <div className="bg-[#E5E5E0] p-6 md:p-8 overflow-y-auto relative flex flex-col items-center">
            <div className="w-full max-w-3xl mb-6 flex items-center gap-2 border-b-2 border-gray-500 pb-2 no-print">
              <div className="w-3 h-3 bg-green-700"></div>
              <h2 className="font-mono text-lg font-bold text-gray-600 uppercase tracking-wider">
                Live Preview
              </h2>
            </div>
            <div className="resume-print w-full max-w-[250mm] mb-4 shadow-[6px_6px_0px_0px_#000000] border-2 border-black bg-white">
              {/* Resume component scale wrapper */}
              <div className="resume-scale origin-top scale-[0.65] md:scale-[0.8] lg:scale-90">
                <Resume
                  resumeData={resumeData}
                  template={templateSettings.template}
                  settings={templateSettings}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#F0F0E8] flex justify-between items-center font-mono text-xs text-blue-700 border-t border-black no-print">
          <span className="uppercase font-bold">Resume Builder Module</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-700"></div>
              <span className="uppercase">
                {templateSettings.template === 'swiss-single' ? 'Single Column' : 'Two Column'}
              </span>
            </div>
            <span className="text-gray-400">|</span>
            <span className="uppercase">
              {templateSettings.pageSize === 'A4' ? 'A4' : 'US Letter'}
            </span>
          </div>
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
