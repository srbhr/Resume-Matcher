import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResumeViewerPage from '@/app/(default)/resumes/[id]/page';
import { downloadResumePdf, fetchResume, getResumePdfUrl } from '@/lib/api/resume';
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateSettings } from '@/lib/types/template-settings';
import { TEMPLATE_SETTINGS_STORAGE_KEY } from '@/lib/utils/stored-template-settings';

const resumeProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));

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
vi.mock('@/components/dashboard/resume-component', () => ({
  default: (props: Record<string, unknown>) => {
    resumeProps.last = props;
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

// What the builder saved after the user formatted the resume.
const builderSettings: TemplateSettings = {
  ...DEFAULT_TEMPLATE_SETTINGS,
  template: 'modern',
  margins: { top: 12, bottom: 12, left: 18, right: 18 },
  fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, base: 2, headerFont: 'sans-serif' },
  accentColor: 'green',
};

beforeEach(() => {
  vi.clearAllMocks();
  resumeProps.last = null;
  localStorage.clear();
  localStorage.setItem(TEMPLATE_SETTINGS_STORAGE_KEY, JSON.stringify(builderSettings));
  vi.mocked(fetchResume).mockResolvedValue({
    title: 'CV',
    processed_resume: { personalInfo: { name: 'Ada' } },
    raw_resume: { processing_status: 'ready' },
  } as Awaited<ReturnType<typeof fetchResume>>);
});

describe('resume viewer template settings', () => {
  it('renders and downloads with the template settings saved in the builder', async () => {
    vi.mocked(downloadResumePdf).mockResolvedValue(new Blob(['pdf']));
    render(<ResumeViewerPage />);

    const download = await screen.findByRole('button', { name: 'resumeViewer.downloadResume' });
    expect(resumeProps.last?.settings).toEqual(builderSettings);

    await act(async () => download.click());
    expect(downloadResumePdf).toHaveBeenCalledWith('resume-123', builderSettings, 'es');
  });

  it('opens the fallback PDF link with the same settings', async () => {
    vi.mocked(downloadResumePdf).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ResumeViewerPage />);

    const download = await screen.findByRole('button', { name: 'resumeViewer.downloadResume' });
    await act(async () => download.click());
    expect(getResumePdfUrl).toHaveBeenCalledWith('resume-123', builderSettings, 'es');
  });
});
