// Central domain-facing TypeScript types used across pages/components
// These are intentionally lightweight and mirror a subset of backend schema fields

export interface ProcessedResumeLite {
  personal_data?: Record<string, unknown> | null;
  experiences?: Record<string, unknown>[] | null;
  projects?: Record<string, unknown>[] | null;
  skills?: (string | Record<string, unknown>)[] | null;
  education?: Record<string, unknown>[] | null;
  extracted_keywords?: string[] | string | null;
}

export interface ProcessedJobLite {
  extracted_keywords?: string[] | string | null;
}

export interface ResumeDataResp {
  resume_id: string;
  processed_resume?: ProcessedResumeLite | null;
  raw_resume?: { content?: string } | null;
}

export interface JobDataResp {
  job_id: string;
  processed_job?: ProcessedJobLite | null;
}

export interface ImprovementResult {
  resume_id: string;
  job_id: string;
  original_score: number;
  new_score: number;
  updated_resume: string;
  resume_preview?: unknown;
  baseline?: {
    added_section: boolean;
    missing_keywords_count: number;
    missing_keywords: string[];
    baseline_score: number;
  };
  llm_used?: boolean;
}
