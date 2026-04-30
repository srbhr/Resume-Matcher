'use client';

import React, { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { fetchResumeList, type ResumeListItem } from '@/lib/api/resume';

export interface ResumeInputValue {
  resumeId: string | null;
  resumeText: string | null;
}

interface ATSResumeInputProps {
  value: ResumeInputValue;
  onChange: (value: ResumeInputValue) => void;
}

type InputMode = 'stored' | 'paste';

export function ATSResumeInput({ value, onChange }: ATSResumeInputProps) {
  const [mode, setMode] = useState<InputMode>('stored');
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(false);

  useEffect(() => {
    setLoadingResumes(true);
    fetchResumeList()
      .then(setResumes)
      .catch(() => setResumes([]))
      .finally(() => setLoadingResumes(false));
  }, []);

  const handleModeSwitch = (newMode: InputMode) => {
    setMode(newMode);
    onChange({ resumeId: null, resumeText: null });
  };

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex border border-black font-mono text-xs uppercase">
        {(['stored', 'paste'] as InputMode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleModeSwitch(m)}
            className={`flex-1 py-2 tracking-widest transition-colors ${
              mode === m
                ? 'bg-black text-white'
                : 'bg-background text-black hover:bg-secondary'
            }`}
          >
            {m === 'stored' ? 'Select Stored Resume' : 'Paste Resume Text'}
          </button>
        ))}
      </div>

      {mode === 'stored' ? (
        <div>
          {loadingResumes ? (
            <p className="font-mono text-xs text-muted-foreground">Loading resumes...</p>
          ) : resumes.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              No stored resumes found. Switch to Paste mode.
            </p>
          ) : (
            <select
              className="w-full border border-black px-3 py-2 font-mono text-sm bg-background focus:outline-none focus:ring-1 focus:ring-black"
              value={value.resumeId ?? ''}
              onChange={(e) =>
                onChange({ resumeId: e.target.value || null, resumeText: null })
              }
            >
              <option value="">— Select a resume —</option>
              {resumes.map((r) => (
                <option key={r.resume_id} value={r.resume_id}>
                  {r.filename ?? r.resume_id}
                  {r.is_master ? ' (master)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <Textarea
          placeholder="Paste your resume text here..."
          value={value.resumeText ?? ''}
          onChange={(e) =>
            onChange({ resumeId: null, resumeText: e.target.value })
          }
          rows={10}
          className="font-mono text-sm border-black"
        />
      )}
    </div>
  );
}
