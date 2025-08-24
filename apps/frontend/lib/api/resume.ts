import { ImprovedResult } from '@/components/common/resume_previewer_context';

// New unified envelopes (backend wraps all responses as { request_id, data })
interface JobUploadEnvelope { request_id?: string; data?: { job_id: string[] | string } }
interface ImproveEnvelope { request_id?: string; data?: ImprovedResult }

const API_URL = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
    const json: JobUploadEnvelope | (JobUploadEnvelope['data']) = await res.json();
    // unwrap envelope or fallback compat if server ever returns flat payload
    const payload = (json as JobUploadEnvelope)?.data ?? (json as JobUploadEnvelope['data']);
    const jobIdField = payload?.job_id as string | string[] | undefined;
    const idArray = Array.isArray(jobIdField) ? jobIdField : jobIdField ? [jobIdField] : [];
    if (!idArray[0]) throw new Error('No job_id returned from server');
    console.log('Job upload response:', json);
    return idArray[0];
}

/** Improves the resume and returns the full preview object */
export async function improveResume(
    resumeId: string,
    jobId: string,
    options?: { useLlm?: boolean; requireLlm?: boolean }
): Promise<ImprovedResult> {
    let response: Response;
    try {
    // Enforce LLM by default; allow opt-out via options
    const params = new URLSearchParams();
    if (options?.useLlm === false) params.set('use_llm', 'false');
    if (options?.requireLlm !== false) params.set('require_llm', 'true');
    const qp = params.toString() ? `?${params.toString()}` : '';
    response = await fetch(`${API_URL}/api/v1/resumes/improve${qp}`, {
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

    let data: ImproveEnvelope | ImprovedResult;
    try {
        data = JSON.parse(text);
    } catch (parseError) {
        console.error('Failed to parse improveResume response:', parseError, 'Raw response:', text);
        throw parseError;
    }

    const payload: ImprovedResult = (data as ImproveEnvelope).data ?? (data as ImprovedResult);
    console.log('Resume improvement response:', payload);
    return payload;
}