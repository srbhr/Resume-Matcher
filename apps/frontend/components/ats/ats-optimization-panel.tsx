'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { saveAtsResume } from '@/lib/api/ats';
import { downloadResumePdf, getResumePdfUrl } from '@/lib/api/resume';
import { buildResumeFilename, downloadBlobAsFile, openUrlInNewTab } from '@/lib/utils/download';
import { useLanguage } from '@/lib/context/language-context';

const ResumeForm = dynamic(
  () => import('@/components/builder/resume-form').then((m) => m.ResumeForm),
  { ssr: false, loading: () => <p className="font-mono text-xs text-muted-foreground p-4">Loading editor...</p> }
);

interface ATSOptimizationPanelProps {
  suggestions: string[];
  optimizedResume: ResumeData;
  resumeId: string | null;
  jobId: string | null;
  jobDescription: string | null;
  resumeText: string | null;
  /** Job posting title — used to name the saved resume */
  jobTitle?: string;
  /** Hiring company name — used to name the saved resume */
  company?: string;
  onSaved: (newResumeId: string) => void;
}

/** Sanitise a string so it's safe to use as a filename or DB title. */
function sanitise(s: string) {
  return s.replace(/[/\\:*?"<>|]/g, '').trim();
}

/** Build the save title: "Role_Company" when available, else fallback. */
function buildTitle(jobTitle?: string, company?: string) {
  const role = jobTitle ? sanitise(jobTitle) : '';
  const co   = company  ? sanitise(company)  : '';
  if (role && co)  return `${role}_${co}`;
  if (role || co)  return role || co;
  return 'ATS Optimized Resume';
}

export function ATSOptimizationPanel({
  suggestions,
  optimizedResume,
  resumeId,
  jobId,
  jobDescription,
  resumeText,
  jobTitle,
  company,
  onSaved,
}: ATSOptimizationPanelProps) {
  const { uiLanguage } = useLanguage();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editedResume, setEditedResume] = useState<ResumeData>(optimizedResume);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedResumeId, setSavedResumeId] = useState<string | null>(null);

  useEffect(() => {
    setEditedResume(optimizedResume);
    setMode('view');
    setSavedResumeId(null); // reset when a new result comes in
  }, [optimizedResume]);

  const title = buildTitle(jobTitle, company);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async (): Promise<string | null> => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await saveAtsResume({
        resume_data: editedResume,
        parent_id: resumeId ?? undefined,
        title,
      });
      setSavedResumeId(result.resume_id);
      onSaved(result.resume_id);
      return result.resume_id;
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────────
  // Saves first if needed, then downloads as a PDF via the backend renderer.
  const handleDownload = async () => {
    setIsDownloading(true);
    setSaveError(null);
    try {
      const id = savedResumeId ?? await handleSave();
      if (!id) return; // save failed — error already set

      const personName = editedResume.personalInfo?.name ?? null;
      const filename = buildResumeFilename(personName, company ?? null, id);
      try {
        const blob = await downloadResumePdf(id, undefined, uiLanguage);
        downloadBlobAsFile(blob, filename);
      } catch (err: unknown) {
        // Fallback: open the PDF URL directly in a new tab if blob download fails
        if (err instanceof TypeError && (err as TypeError).message.includes('Failed to fetch')) {
          const fallbackUrl = getResumePdfUrl(id, undefined, uiLanguage);
          if (!openUrlInNewTab(fallbackUrl)) {
            setSaveError(`Download failed. Open manually: ${fallbackUrl}`);
          }
          return;
        }
        throw err;
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Optimization Suggestions */}
      {suggestions.length > 0 && (
        <div className="border border-black">
          <div className="bg-black text-white font-mono text-xs uppercase tracking-widest px-4 py-2">
            Optimization Suggestions
          </div>
          <ul className="divide-y divide-black">
            {suggestions.map((s, i) => (
              <li key={i} className="flex gap-3 px-4 py-3 font-mono text-sm">
                <span className="text-blue-700 font-bold shrink-0">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Optimized Resume */}
      <div className="border border-black">
        <div className="flex items-center justify-between bg-black text-white px-4 py-2">
          <span className="font-mono text-xs uppercase tracking-widest">
            ATS Optimized Resume
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
              className="font-mono text-xs uppercase tracking-widest px-3 py-1 border border-white hover:bg-white hover:text-black transition-colors"
            >
              {mode === 'view' ? 'Edit' : 'Preview'}
            </button>
          </div>
        </div>

        <div className="p-4">
          {mode === 'edit' ? (
            <ResumeForm
              resumeData={editedResume}
              onUpdate={(updated) => setEditedResume(updated)}
            />
          ) : (
            <div className="font-mono text-sm whitespace-pre-wrap text-muted-foreground bg-secondary p-4 border border-black max-h-96 overflow-y-auto">
              {JSON.stringify(editedResume, null, 2)}
            </div>
          )}
        </div>

        {/* Save title preview */}
        <div className="border-t border-black px-4 py-2 bg-secondary">
          <p className="font-mono text-xs text-muted-foreground">
            Will be saved as: <span className="text-black font-bold">{title}</span>
          </p>
        </div>

        <div className="border-t border-black px-4 py-3 flex flex-wrap gap-3 items-center">
          <Button
            onClick={handleSave}
            disabled={isSaving || isDownloading}
            className="font-mono text-xs uppercase tracking-widest"
          >
            {isSaving ? 'Saving...' : savedResumeId ? '✓ Saved' : 'Save as New Resume'}
          </Button>

          <Button
            onClick={handleDownload}
            disabled={isSaving || isDownloading}
            variant="outline"
            className="font-mono text-xs uppercase tracking-widest border-black"
          >
            {isDownloading ? (
              'Preparing...'
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Resume
              </>
            )}
          </Button>

          {saveError && (
            <p className="font-mono text-xs text-red-600 w-full">{saveError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
