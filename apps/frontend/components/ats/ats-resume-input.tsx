'use client';

import React, { useEffect, useState } from 'react';
import { fetchResumeList, type ResumeListItem } from '@/lib/api/resume';

export interface ResumeInputValue {
  resumeId: string | null;
  resumeText: string | null;
  isMaster?: boolean;
}

interface ATSResumeInputProps {
  value: ResumeInputValue;
  onChange: (value: ResumeInputValue) => void;
}

export function ATSResumeInput({ value, onChange }: ATSResumeInputProps) {
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchResumeList(true)
      .then(setResumes)
      .catch(() => setResumes([]))
      .finally(() => setLoading(false));
  }, []);

  // Default to the master resume the first time the list loads.
  useEffect(() => {
    if (hasInitialized || resumes.length === 0) return;
    if (value.resumeId) {
      setHasInitialized(true);
      return;
    }
    const master = resumes.find((r) => r.is_master);
    const chosen = master ?? resumes[0];
    if (chosen) {
      onChange({
        resumeId: chosen.resume_id,
        resumeText: null,
        isMaster: chosen.is_master,
      });
    }
    setHasInitialized(true);
  }, [resumes, hasInitialized, value.resumeId, onChange]);

  const sorted = [...resumes].sort((a, b) => Number(b.is_master) - Number(a.is_master));

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="font-mono text-xs text-muted-foreground">Loading resumes...</p>
      ) : sorted.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">
          No stored resumes found. Upload a resume from the dashboard.
        </p>
      ) : (
        <select
          className="w-full border border-black px-3 py-2 font-mono text-sm bg-background focus:outline-none focus:ring-1 focus:ring-black"
          value={value.resumeId ?? ''}
          onChange={(e) => {
            const id = e.target.value || null;
            const picked = sorted.find((r) => r.resume_id === id);
            onChange({
              resumeId: id,
              resumeText: null,
              isMaster: picked?.is_master ?? false,
            });
          }}
        >
          {sorted.map((r) => (
            <option key={r.resume_id} value={r.resume_id}>
              {r.title || r.filename || r.resume_id}
              {r.is_master ? ' (master)' : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
