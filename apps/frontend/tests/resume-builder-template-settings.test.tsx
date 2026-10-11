import React from 'react';
import { renderToString } from 'react-dom/server';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATE_SETTINGS_STORAGE_KEY } from '@/lib/utils/stored-template-settings';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('id=a&tab=resume'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/api/resume', () => ({
  fetchResume: vi.fn(() => new Promise(() => {})),
  updateResume: vi.fn(),
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
  FormattingControls: ({ settings }: { settings: { template: string } }) => (
    <output data-testid="template">{settings.template}</output>
  ),
}));
vi.mock('@/components/builder/regenerate-wizard', () => ({ RegenerateWizard: () => null }));
// Dialogs portal into document.body, which renderToString can't do under jsdom.
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/hooks/use-regenerate-wizard', () => ({
  useRegenerateWizard: () => ({ step: 'idle', reset: vi.fn(), startRegenerate: vi.fn() }),
}));

const STORED = JSON.stringify({ template: 'swiss-two-column' });

const importBuilder = async () =>
  (await import('@/components/builder/resume-builder')).ResumeBuilder;

beforeEach(() => localStorage.setItem(TEMPLATE_SETTINGS_STORAGE_KEY, STORED));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetModules();
});

describe('builder template settings hydration', () => {
  it('server-renders the default template even when one is stored', async () => {
    const Builder = await importBuilder();
    const html = renderToString(<Builder />);
    expect(html).toContain('swiss-single');
    expect(html).not.toContain('swiss-two-column');
  });

  it('applies the stored template after mount without overwriting it', async () => {
    const Builder = await importBuilder();
    render(<Builder />);
    await waitFor(() =>
      expect(screen.getByTestId('template')).toHaveTextContent('swiss-two-column')
    );
    expect(JSON.parse(localStorage.getItem(TEMPLATE_SETTINGS_STORAGE_KEY)!).template).toBe(
      'swiss-two-column'
    );
  });
});
