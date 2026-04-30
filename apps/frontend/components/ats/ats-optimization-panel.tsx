'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { ResumeForm } from '@/components/builder/resume-form';
import { saveAtsResume } from '@/lib/api/ats';

interface ATSOptimizationPanelProps {
  suggestions: string[];
  optimizedResume: ResumeData;
  resumeId: string | null;
  jobId: string | null;
  jobDescription: string | null;
  resumeText: string | null;
  onSaved: (newResumeId: string) => void;
}

export function ATSOptimizationPanel({
  suggestions,
  optimizedResume,
  resumeId,
  jobId,
  jobDescription,
  resumeText,
  onSaved,
}: ATSOptimizationPanelProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editedResume, setEditedResume] = useState<ResumeData>(optimizedResume);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setEditedResume(optimizedResume);
    setMode('view'); // Reset to view when a new result comes in
  }, [optimizedResume]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await saveAtsResume({
        resume_data: editedResume,
        parent_id: resumeId ?? undefined,
      });
      onSaved(result.resume_id);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
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

        <div className="border-t border-black px-4 py-3 flex gap-3 items-center">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="font-mono text-xs uppercase tracking-widest"
          >
            {isSaving ? 'Saving...' : 'Save as New Resume'}
          </Button>
          {saveError && (
            <p className="font-mono text-xs text-red-600">{saveError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
