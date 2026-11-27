'use client';

import { useEffect, useRef, useState } from 'react';
import { parseJobMetadata } from '@/lib/api/resume';

export type JobDetailField = 'role' | 'company' | 'jobReqId';

const DETECT_DELAY_MS = 300;
const FIELDS: readonly JobDetailField[] = ['role', 'company', 'jobReqId'];
const EMPTY: Record<JobDetailField, string> = { role: '', company: '', jobReqId: '' };

export interface JobDetails {
  role: string;
  company: string;
  jobReqId: string;
  /**
   * The details to send with the job: what the user typed, and what was detected
   * for the text as it is now. A detected value from an earlier version of the
   * text (detection runs a moment after typing stops) is left out, so the server
   * reads the details itself instead of taking the previous job's.
   */
  current: () => Record<JobDetailField, string>;
  /** Whether the user typed this field's value, rather than it being detected. */
  isEdited: (field: JobDetailField) => boolean;
  /**
   * Set a field by hand: detection leaves it alone. Emptying it hands it back to
   * detection: it stays empty while being retyped, and if it is sent empty the
   * server reads that detail from the description itself.
   */
  edit: (field: JobDetailField, value: string) => void;
  /** Clear every field and forget the hand edits (after the job is handed off). */
  reset: () => void;
}

/**
 * Role, company and job ID for a pasted job description, detected on the
 * server's heuristics (no AI call) a moment after typing stops. A field the user
 * typed into keeps their value; detection fills the others. A detection replaces
 * the last one, including with "nothing found", and so does a failed one, so one
 * job's company never sticks to the next description.
 */
export function useJobDetails(text: string): JobDetails {
  const [values, setValues] = useState<Record<JobDetailField, string>>(EMPTY);
  // The text the detected values belong to.
  const [detectedFor, setDetectedFor] = useState('');
  const edited = useRef(new Set<JobDetailField>());

  useEffect(() => {
    const trimmed = text.trim();
    const apply = (found: Record<JobDetailField, string>) => {
      setDetectedFor(trimmed);
      setValues((prev) => {
        const next = { ...prev };
        for (const field of FIELDS) if (!edited.current.has(field)) next[field] = found[field];
        return next;
      });
    };
    if (!trimmed) {
      apply(EMPTY);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const parsed = await parseJobMetadata(trimmed);
        if (!cancelled) {
          apply({ role: parsed.role, company: parsed.company, jobReqId: parsed.job_req_id });
        }
      } catch (err) {
        console.error('Failed to detect job details', err);
        if (!cancelled) apply(EMPTY);
      }
    }, DETECT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  const upToDate = detectedFor === text.trim();

  return {
    ...values,
    current: () => {
      const out = { ...EMPTY };
      for (const field of FIELDS) {
        if (edited.current.has(field) || upToDate) out[field] = values[field].trim();
      }
      return out;
    },
    isEdited: (field) => edited.current.has(field),
    edit: (field, value) => {
      if (value.trim()) {
        edited.current.add(field);
        setValues((prev) => ({ ...prev, [field]: value }));
        return;
      }
      edited.current.delete(field);
      setValues((prev) => ({ ...prev, [field]: '' }));
    },
    reset: () => {
      edited.current.clear();
      setValues(EMPTY);
    },
  };
}
