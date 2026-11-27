'use client';

import { useEffect, useRef, useState } from 'react';
import { parseJobMetadata } from '@/lib/api/resume';

export type JobDetailField = 'role' | 'company' | 'jobReqId';

const DETECT_DELAY_MS = 300;

export interface JobDetails {
  role: string;
  company: string;
  jobReqId: string;
  /** Set a field by hand: detection leaves it alone until it is emptied again. */
  edit: (field: JobDetailField, value: string) => void;
  /** Clear every field and forget the hand edits (after the job is handed off). */
  reset: () => void;
}

/**
 * Role, company and job ID for a pasted job description, detected on the
 * server's heuristics (no AI call) a moment after typing stops. A field the user
 * typed into keeps their value; detection fills the others. A detection replaces
 * the last one, including with "nothing found", so one job's company never
 * sticks to the next description.
 */
export function useJobDetails(text: string): JobDetails {
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [jobReqId, setJobReqId] = useState('');
  const edited = useRef(new Set<JobDetailField>());

  useEffect(() => {
    const apply = (nextRole: string, nextCompany: string, nextJobReqId: string) => {
      if (!edited.current.has('role')) setRole(nextRole);
      if (!edited.current.has('company')) setCompany(nextCompany);
      if (!edited.current.has('jobReqId')) setJobReqId(nextJobReqId);
    };
    const trimmed = text.trim();
    if (!trimmed) {
      apply('', '', '');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const parsed = await parseJobMetadata(trimmed);
        if (!cancelled) apply(parsed.role, parsed.company, parsed.job_req_id);
      } catch (err) {
        console.error('Failed to detect job details', err);
      }
    }, DETECT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  const setters: Record<JobDetailField, (value: string) => void> = {
    role: setRole,
    company: setCompany,
    jobReqId: setJobReqId,
  };

  return {
    role,
    company,
    jobReqId,
    edit: (field, value) => {
      setters[field](value);
      if (value.trim()) edited.current.add(field);
      else edited.current.delete(field);
    },
    reset: () => {
      edited.current.clear();
      setRole('');
      setCompany('');
      setJobReqId('');
    },
  };
}
