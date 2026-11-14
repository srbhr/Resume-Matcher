import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadResumePdf, fetchResume } from '@/lib/api/resume';
import { downloadBlobAsFile } from '@/lib/utils/download';
import { Toaster, toast } from '@/components/ui/toaster';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('id=a&tab=resume'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/lib/api/resume', () => ({
  fetchResume: vi.fn(),
  updateResume: vi.fn(),
  updateResumeTemplateSettings: vi.fn(() => Promise.resolve()),
  updateCoverLetter: vi.fn(),
  updateOutreachMessage: vi.fn(),
  downloadCoverLetterPdf: vi.fn(),
  downloadResumePdf: vi.fn(),
  getResumePdfUrl: vi.fn(() => ''),
  getCoverLetterPdfUrl: vi.fn(() => ''),
  generateCoverLetter: vi.fn(),
  generateOutreachMessage: vi.fn(),
  generateInterviewPrep: vi.fn(),
  fetchJobDescription: vi.fn(() => Promise.resolve(null)),
  fetchLastAtsScore: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/lib/utils/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils/download')>()),
  downloadBlobAsFile: vi.fn(),
}));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'en', contentLanguage: 'en' }),
}));
vi.mock('@/components/common/resume_previewer_context', () => ({
  useResumePreview: () => ({ improvedData: null }),
}));
vi.mock('@/components/preview', () => ({ PaginatedPreview: () => null }));
vi.mock('@/components/builder/resume-form', () => ({ ResumeForm: () => null }));
vi.mock('@/components/builder/formatting-controls', () => ({ FormattingControls: () => null }));
vi.mock('@/components/builder/regenerate-wizard', () => ({ RegenerateWizard: () => null }));
vi.mock('@/hooks/use-regenerate-wizard', () => ({
  useRegenerateWizard: () => ({ step: 'idle', reset: vi.fn(), startRegenerate: vi.fn() }),
}));

afterEach(() => {
  act(() => toast.dismiss());
  cleanup();
  localStorage.clear();
});

describe('builder resume download', () => {
  it('confirms a finished download with a toast, not a dialog to dismiss (#1091)', async () => {
    vi.mocked(fetchResume).mockResolvedValue({
      resume_id: 'a',
      raw_resume: { processing_status: 'ready' },
      processed_resume: {
        personalInfo: { name: 'Ada' },
        summary: '',
        workExperience: [],
        education: [],
        personalProjects: [],
        additional: {},
      },
    } as unknown as Awaited<ReturnType<typeof fetchResume>>);
    vi.mocked(downloadResumePdf).mockResolvedValue(new Blob(['pdf']));
    const { ResumeBuilder } = await import('@/components/builder/resume-builder');
    render(
      <>
        <ResumeBuilder />
        <Toaster />
      </>
    );
    await waitFor(() => expect(fetchResume).toHaveBeenCalledWith('a'));
    await act(async () => {});

    await act(async () => screen.getByRole('button', { name: /common\.download/ }).click());

    expect(downloadBlobAsFile).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('builder.alerts.downloadSuccess')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
