import { ImprovedResult } from '@/components/common/resume_previewer_context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Matches backend schemas/models.py ResumeData
interface ProcessedResume {
  personalInfo?: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    website?: string | null;
    linkedin?: string | null;
    github?: string | null;
  };
  summary?: string;
  workExperience?: Array<{
    id: number;
    title?: string;
    company?: string;
    location?: string | null;
    years?: string;
    description?: string[];
  }>;
  education?: Array<{
    id: number;
    institution?: string;
    degree?: string;
    years?: string;
    description?: string | null;
  }>;
  personalProjects?: Array<{
    id: number;
    name?: string;
    role?: string;
    years?: string;
    description?: string[];
  }>;
  additional?: {
    technicalSkills?: string[];
    languages?: string[];
    certificationsTraining?: string[];
    awards?: string[];
  };
}

interface ResumeResponse {
  request_id: string;
  data: {
    resume_id: string;
    raw_resume: {
      id: number | null;
      content: string;
      content_type: string;
      created_at: string;
      processing_status: 'pending' | 'processing' | 'ready' | 'failed';
    };
    processed_resume: ProcessedResume | null;
  };
}

export interface ResumeListItem {
  resume_id: string;
  filename: string | null;
  is_master: boolean;
  parent_id: string | null;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
}

/** Uploads job descriptions and returns a job_id */
export async function uploadJobDescriptions(
  descriptions: string[],
  resumeId: string
): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/jobs/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_descriptions: descriptions, resume_id: resumeId }),
  });
  if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
  const data = await res.json();
  console.log('Job upload response:', data);
  return data.job_id[0];
}

/** Improves the resume and returns the full preview object */
export async function improveResume(resumeId: string, jobId: string): Promise<ImprovedResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/resumes/improve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_id: resumeId, job_id: jobId }),
    });
  } catch (networkError) {
    console.error('Network error during improveResume:', networkError);
    throw networkError;
  }

  const text = await response.text();
  if (!response.ok) {
    console.error('Improve failed response body:', text);
    throw new Error(`Improve failed with status ${response.status}: ${text}`);
  }

  let data: ImprovedResult;
  try {
    data = JSON.parse(text) as ImprovedResult;
  } catch (parseError) {
    console.error('Failed to parse improveResume response:', parseError, 'Raw response:', text);
    throw parseError;
  }

  console.log('Resume improvement response:', data);
  return data;
}

/** Fetches a raw resume record for previewing the original upload */
export async function fetchResume(resumeId: string): Promise<ResumeResponse['data']> {
  const res = await fetch(`${API_URL}/api/v1/resumes?resume_id=${encodeURIComponent(resumeId)}`);
  if (!res.ok) {
    throw new Error(`Failed to load resume (status ${res.status}).`);
  }
  const payload = (await res.json()) as ResumeResponse;
  // Support both raw_resume content (initial) and processed_resume (if available)
  // The viewer/builder logic should prioritize processed data if present
  return payload.data;
}

export async function fetchResumeList(includeMaster = false): Promise<ResumeListItem[]> {
  const res = await fetch(
    `${API_URL}/api/v1/resumes/list?include_master=${includeMaster ? 'true' : 'false'}`
  );
  if (!res.ok) {
    throw new Error(`Failed to load resumes list (status ${res.status}).`);
  }
  const payload = (await res.json()) as { data: ResumeListItem[] };
  return payload.data;
}
