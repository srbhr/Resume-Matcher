import { ImprovedResult } from '@/components/common/resume_previewer_context';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

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
    const res = await fetch(`${API_URL}/api/v1/resumes/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: resumeId, job_id: jobId }),
    });
    if (!res.ok) throw new Error(`Improve failed with status ${res.status}`);
    const data = await res.json();
    console.log('Resume improvement response:', data);
    return data as ImprovedResult;
}