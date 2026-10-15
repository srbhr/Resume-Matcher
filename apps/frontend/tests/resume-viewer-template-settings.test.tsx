import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResumeViewerPage from '@/app/(default)/resumes/[id]/page';
import { downloadResumePdf, fetchResume, getResumePdfUrl } from '@/lib/api/resume';
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateSettings } from '@/lib/types/template-settings';

const previewProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'resume-123' }),
}));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ decrementResumes: vi.fn(), setHasMasterResume: vi.fn() }),
}));
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'es' }),
}));
vi.mock('@/components/enrichment/enrichment-modal', () => ({ EnrichmentModal: () => null }));
vi.mock('@/components/preview', () => ({
  PaginatedPreview: (props: Record<string, unknown>) => {
    previewProps.last = props;
    return null;
  },
}));
vi.mock('@/lib/api/resume', () => ({
  fetchResume: vi.fn(),
  downloadResumePdf: vi.fn(),
  getResumePdfUrl: vi.fn(() => 'https://example.invalid/pdf'),
}));
vi.mock('@/lib/utils/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/download')>();
  return { ...actual, downloadBlobAsFile: vi.fn(), openUrlInNewTab: vi.fn(() => true) };
});

// What the builder saved for this resume.
const saved: TemplateSettings = {
  ...DEFAULT_TEMPLATE_SETTINGS,
  template: 'vivid-single',
  margins: { top: 12, bottom: 12, left: 18, right: 18 },
  fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, base: 2, headerFont: 'sans-serif' },
  accentColor: 'green',
};

function mockResume(templateSettings: TemplateSettings | null): void {
  vi.mocked(fetchResume).mockResolvedValue({
    title: 'CV',
    processed_resume: { personalInfo: { name: 'Ada' } },
    raw_resume: { processing_status: 'ready' },
    template_settings: templateSettings,
  } as Awaited<ReturnType<typeof fetchResume>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  previewProps.last = null;
  localStorage.clear();
});

describe('resume viewer template settings', () => {
  it('previews and downloads with the formatting saved for this resume', async () => {
    mockResume(saved);
    vi.mocked(downloadResumePdf).mockResolvedValue(new Blob(['pdf']));
    render(<ResumeViewerPage />);

    const download = await screen.findByRole('button', { name: 'resumeViewer.downloadResume' });
    expect(previewProps.last?.settings).toEqual(saved);
    expect(previewProps.last?.resumeData).toMatchObject({ personalInfo: { name: 'Ada' } });

    await act(async () => download.click());
    expect(downloadResumePdf).toHaveBeenCalledWith('resume-123', saved, 'es');
  });

  it('shows and downloads a never-formatted resume in the default template', async () => {
    // A browser-wide setting from older versions must not leak into this resume.
    localStorage.setItem('resume_builder_settings', JSON.stringify({ template: 'modern' }));
    mockResume(null);
    vi.mocked(downloadResumePdf).mockResolvedValue(new Blob(['pdf']));
    render(<ResumeViewerPage />);

    const download = await screen.findByRole('button', { name: 'resumeViewer.downloadResume' });
    expect(previewProps.last?.settings).toEqual(DEFAULT_TEMPLATE_SETTINGS);

    await act(async () => download.click());
    expect(downloadResumePdf).toHaveBeenCalledWith('resume-123', DEFAULT_TEMPLATE_SETTINGS, 'es');
  });

  it('opens the fallback PDF link with the same settings', async () => {
    mockResume(saved);
    vi.mocked(downloadResumePdf).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ResumeViewerPage />);

    const download = await screen.findByRole('button', { name: 'resumeViewer.downloadResume' });
    await act(async () => download.click());
    expect(getResumePdfUrl).toHaveBeenCalledWith('resume-123', saved, 'es');
  });
});
