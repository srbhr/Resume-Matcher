const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export interface ResumeUploadResponse {
  message: string;
  request_id: string;
  resume_id: string;
}

export const uploadResume = async (file: File): Promise<ResumeUploadResponse> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    console.log('Sending file upload request to:', `${API_URL}/upload`);
    const response = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Upload failed:', errorData);
      throw new Error(errorData.detail || 'Upload failed');
    }

    const data = await response.json();
    console.log('Upload successful, response:', data);
    return data as ResumeUploadResponse;
  } catch (error: any) {
    console.error('Upload error:', error);
    throw new Error(error.message || 'Failed to upload resume');
  }
};

export interface ResumeImprovement {
  resume_id: string;
  job_id: string;
  stream?: boolean;
}

export const improveResume = async ({ resume_id, job_id, stream = false }: ResumeImprovement) => {
  try {
    const response = await fetch(`${API_URL}/improve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resume_id,
        job_id,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Improvement request failed');
    }

    return response;
  } catch (error: any) {
    throw new Error(error.message || 'Failed to request resume improvement');
  }
};