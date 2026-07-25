import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteResumePhoto,
  generateInterviewPrep,
  getResumePhotoSourceUrl,
  getResumePhotoUrl,
  patchResumePhoto,
  putResumePhoto,
} from '@/lib/api/resume';

const interviewPrep = {
  role_fit_analysis: ['Backend API experience fits the role.'],
  resume_questions: [
    {
      question: 'How did you build the API?',
      focus_area: 'Backend architecture',
      suggested_answer_points: ['Discuss resume-grounded API work.'],
    },
  ],
  project_follow_ups: [],
  skill_gaps: [
    {
      skill: 'Kubernetes',
      why_it_matters: 'The JD mentions deployments.',
      preparation_suggestion: 'Review basics without claiming experience.',
    },
  ],
  talking_points: ['Connect API work to the role.'],
};

describe('resume API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates interview prep and parses the structured payload', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          interview_prep: interviewPrep,
          message: 'Interview preparation generated successfully',
        }),
        { status: 200 }
      )
    );

    await expect(generateInterviewPrep('res 123')).resolves.toEqual(interviewPrep);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/resumes/res%20123/generate-interview-prep');
    expect(init.method).toBe('POST');
  });

  it('throws a useful error when interview prep generation fails', async () => {
    fetchMock.mockResolvedValue(new Response('server boom', { status: 500 }));

    await expect(generateInterviewPrep('res-123')).rejects.toThrow(
      'Failed to generate interview preparation'
    );
  });

  it('builds versioned photo and source URLs', () => {
    expect(getResumePhotoUrl('res 123', 4)).toBe('/api/v1/resumes/res%20123/photo?v=4');
    expect(getResumePhotoSourceUrl('res 123', 4)).toBe(
      '/api/v1/resumes/res%20123/photo/source?v=4'
    );
  });

  it('uploads photo settings as multipart data without forcing content type', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { resume_id: 'res-1', processed_resume: {} } }), {
        status: 200,
      })
    );
    const file = new File(['photo'], 'photo.png', { type: 'image/png' });

    await putResumePhoto('res-1', file, {
      cropX: 25,
      cropY: 0,
      cropWidth: 50,
      cropHeight: 75,
      size: 88,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/resumes/res-1/photo');
    expect(init.method).toBe('PUT');
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('file')).toBe(file);
    expect(init.body.get('crop_x')).toBe('25');
    expect(init.body.get('crop_height')).toBe('75');
    expect(init.body.get('zoom')).toBeNull();
  });

  it('updates and deletes a photo through dedicated endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resume_id: 'res-1', processed_resume: {} } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { resume_id: 'res-1', processed_resume: {} } }), {
          status: 200,
        })
      );

    await patchResumePhoto('res-1', {
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
      size: 96,
    });
    await deleteResumePhoto('res-1');

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({
        cropX: 0,
        cropY: 0,
        cropWidth: 100,
        cropHeight: 100,
        size: 96,
      }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });
});
