import React from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchResume, updateResumeTemplateSettings } from '@/lib/api/resume';
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateSettings } from '@/lib/types/template-settings';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('id=a&tab=resume'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/api/resume', () => ({
  fetchResume: vi.fn(() => new Promise(() => {})),
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
  fetchJobDescription: vi.fn(() => new Promise(() => {})),
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
vi.mock('@/components/builder/formatting-controls', () => ({
  FormattingControls: ({
    settings,
    onChange,
  }: {
    settings: TemplateSettings;
    onChange: (next: TemplateSettings) => void;
  }) => (
    <>
      <output data-testid="template">{settings.template}</output>
      <button onClick={() => onChange({ ...settings, template: 'vivid-single' })}>
        pick vivid
      </button>
    </>
  ),
}));
vi.mock('@/components/builder/regenerate-wizard', () => ({ RegenerateWizard: () => null }));
// Dialogs portal into document.body, which renderToString can't do under jsdom.
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/hooks/use-regenerate-wizard', () => ({
  useRegenerateWizard: () => ({ step: 'idle', reset: vi.fn(), startRegenerate: vi.fn() }),
}));

const RESUME = {
  personalInfo: { name: 'Ada' },
  summary: '',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};
const SAVED: TemplateSettings = { ...DEFAULT_TEMPLATE_SETTINGS, template: 'swiss-two-column' };

function serveResume(templateSettings: TemplateSettings | null): void {
  vi.mocked(fetchResume).mockResolvedValue({
    resume_id: 'a',
    raw_resume: { processing_status: 'ready' },
    processed_resume: RESUME,
    template_settings: templateSettings,
  } as unknown as Awaited<ReturnType<typeof fetchResume>>);
}

const importBuilder = async () =>
  (await import('@/components/builder/resume-builder')).ResumeBuilder;

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetModules();
});

describe('builder template settings', () => {
  it('server-renders the default template before the resume loads', async () => {
    const Builder = await importBuilder();
    const html = renderToString(<Builder />);
    expect(html).toContain('swiss-single');
  });

  it("applies the resume's saved formatting when it loads", async () => {
    serveResume(SAVED);
    const Builder = await importBuilder();
    render(<Builder />);
    await waitFor(() =>
      expect(screen.getByTestId('template')).toHaveTextContent('swiss-two-column')
    );
    expect(updateResumeTemplateSettings).not.toHaveBeenCalled();
  });

  it('opens a never-formatted resume in the default template', async () => {
    // A browser-wide setting from older versions must not leak into this resume.
    localStorage.setItem('resume_builder_settings', JSON.stringify({ template: 'modern' }));
    serveResume(null);
    const Builder = await importBuilder();
    render(<Builder />);
    await waitFor(() => expect(fetchResume).toHaveBeenCalledWith('a'));
    await act(async () => {});
    expect(screen.getByTestId('template')).toHaveTextContent('swiss-single');
  });

  it('saves a formatting change to this resume', async () => {
    serveResume(null);
    const Builder = await importBuilder();
    render(<Builder />);
    await waitFor(() => expect(fetchResume).toHaveBeenCalledWith('a'));
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'pick vivid' }));

    expect(screen.getByTestId('template')).toHaveTextContent('vivid-single');
    await waitFor(() =>
      expect(updateResumeTemplateSettings).toHaveBeenCalledWith('a', {
        ...DEFAULT_TEMPLATE_SETTINGS,
        template: 'vivid-single',
      })
    );
    expect(updateResumeTemplateSettings).toHaveBeenCalledTimes(1);
  });

  it('saves a pending formatting change when the builder closes', async () => {
    serveResume(null);
    const Builder = await importBuilder();
    const { unmount } = render(<Builder />);
    await waitFor(() => expect(fetchResume).toHaveBeenCalledWith('a'));
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'pick vivid' }));
    unmount();

    expect(updateResumeTemplateSettings).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ template: 'vivid-single' })
    );
  });
});
