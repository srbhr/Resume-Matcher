import { ImprovedResult } from '@/components/common/resume_previewer_context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ResumeResponse {
	request_id: string;
	data: {
		resume_id: string;
		raw_resume: {
			id: number;
			content: string;
			content_type: string;
			created_at: string | null;
		};
		processed_resume:
			| {
				personal_data: unknown;
				experiences: unknown;
				projects: unknown;
				skills: unknown;
				research_work: unknown;
				achievements: unknown;
				education: unknown;
				extracted_keywords: unknown;
				processed_at: string | null;
			}
			| null;
	};
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
export async function improveResume(
    resumeId: string,
    jobId: string
): Promise<ImprovedResult> {
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
	if (!payload?.data?.raw_resume?.content) {
		throw new Error('Resume content is unavailable.');
	}
	return payload.data;
}
