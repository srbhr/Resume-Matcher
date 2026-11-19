import { useEffect, useState } from 'react';
import { fetchJobDescription } from '@/lib/api/resume';
import { useAgentRefresh } from '@/hooks/use-agent-refresh';

export type JobContextStatus = 'idle' | 'loading' | 'available' | 'missing';

/**
 * The job a tailored resume was made for: its description, saved keywords,
 * company and forced keywords. Loaded when the resume is tailored; in agent
 * mode it picks up keywords the agent adds while the page is open.
 */
export function useJobContext(
  resumeId: string | null,
  isTailoredResume: boolean,
  agentMode: boolean
) {
  const [jobDescription, setJobDescription] = useState<string | null>(null);
  // The job's saved keywords (null when it has none) and company, for JD Match.
  const [jobKeywords, setJobKeywords] = useState<string[] | null>(null);
  const [jobCompany, setJobCompany] = useState<string | null>(null);
  const [jobForcedKeywords, setJobForcedKeywords] = useState<string[]>([]);
  const [jobContextStatus, setJobContextStatus] = useState<JobContextStatus>('idle');

  // Fetch job description when we have a tailored resume
  useEffect(() => {
    let cancelled = false;

    const loadJobDescription = async () => {
      if (isTailoredResume && resumeId) {
        setJobDescription(null);
        setJobContextStatus('loading');
        try {
          const data = await fetchJobDescription(resumeId);
          if (!cancelled) {
            setJobDescription(data.content);
            setJobKeywords(data.keywords);
            setJobCompany(data.company);
            setJobForcedKeywords(data.forced_keywords ?? []);
            setJobContextStatus('available');
          }
        } catch (err) {
          // JD might not be available for older resumes
          if (!cancelled) {
            console.warn('Could not fetch job description:', err);
            setJobDescription(null);
            setJobContextStatus('missing');
          }
        }
      } else {
        // Clear job description when switching to non-tailored resume
        setJobDescription(null);
        setJobContextStatus('idle');
      }
    };

    void loadJobDescription();
    return () => {
      cancelled = true;
    };
  }, [isTailoredResume, resumeId]);

  // The agent can add keywords to this resume's job (set_job_keywords) while the page is open.
  useAgentRefresh(
    agentMode && jobContextStatus === 'available' && jobKeywords === null,
    async () => {
      if (!resumeId) return;
      const data = await fetchJobDescription(resumeId);
      if (data.keywords) {
        setJobKeywords(data.keywords);
        setJobCompany(data.company);
      }
    }
  );

  return { jobDescription, jobKeywords, jobCompany, jobForcedKeywords, jobContextStatus };
}
