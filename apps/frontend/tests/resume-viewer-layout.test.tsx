import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResumeViewerPage from '@/app/(default)/resumes/[id]/page';
import { fetchResume } from '@/lib/api/resume';

const push = vi.fn();
const translate = (key: string) => key;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: 'r1' }),
}));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: translate }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ decrementResumes: vi.fn(), setHasMasterResume: vi.fn() }),
}));
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'en' }),
}));
vi.mock('@/components/enrichment/enrichment-modal', () => ({ EnrichmentModal: () => null }));
vi.mock('@/components/dashboard/resume-component', () => ({ default: () => null }));
vi.mock('@/lib/api/resume', () => ({
  fetchResume: vi.fn(),
  deleteResume: vi.fn(),
  retryProcessing: vi.fn(),
  renameResume: vi.fn(),
  setDefaultMasterResume: vi.fn(),
  duplicateResume: vi.fn(),
  downloadResumePdf: vi.fn(),
  getResumePdfUrl: vi.fn(() => 'https://example.invalid/pdf'),
}));

const mockedFetch = vi.mocked(fetchResume);

function mockResume(overrides: Record<string, unknown>): void {
  mockedFetch.mockResolvedValue({
    processed_resume: { personalInfo: { name: 'Ada' } },
    raw_resume: { processing_status: 'ready' },
    ...overrides,
  } as Awaited<ReturnType<typeof fetchResume>>);
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('resume viewer layout', () => {
  it('frames the loaded viewer with one PageHeader h1 and a back link', async () => {
    mockResume({ title: 'SWE track', is_master: true, is_default_master: true });
    const { container } = render(<ResumeViewerPage />);

    const title = await screen.findByRole('heading', { level: 1, name: 'SWE track' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(title).toHaveClass('font-serif', 'uppercase', 'text-4xl');
    expect(container.firstChild as HTMLElement).toHaveClass('bg-blueprint');
    expect(screen.getByRole('link', { name: 'nav.backToDashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    // The DEFAULT marker is the shared DefaultBadge.
    expect(screen.getByText('resumeViewer.defaultBadge')).toHaveClass('border-ink', 'font-mono');
  });

  it('keeps Enhance as the only primary action, with no decorative icon', async () => {
    mockResume({ title: 'SWE track', is_master: true, is_default_master: false });
    render(<ResumeViewerPage />);

    const enhance = await screen.findByRole('button', { name: 'resumeViewer.enhanceResume' });
    expect(enhance).toHaveClass('bg-primary');
    expect(enhance.querySelector('svg')).toBeNull();
    const primaries = screen
      .getAllByRole('button')
      .filter((button) => button.classList.contains('bg-primary'));
    expect(primaries).toEqual([enhance]);
    const download = screen.getByRole('button', { name: 'resumeViewer.downloadResume' });
    expect(download).not.toHaveClass('bg-success');
    expect(download).toHaveClass('bg-canvas', 'border-ink');
  });

  it('renames through an icon button and the Input primitive', async () => {
    mockResume({ title: 'SWE track', is_master: true, is_default_master: false });
    render(<ResumeViewerPage />);

    const rename = await screen.findByRole('button', { name: 'resumeViewer.renameTitle' });
    expect(rename).toHaveAttribute('type', 'button');
    expect(rename).toHaveClass('h-8', 'w-8');
    fireEvent.click(rename);

    const input = screen.getByRole('textbox', { name: 'resumeViewer.renameTitle' });
    expect(input).toHaveValue('SWE track');
    expect(input).toHaveClass('border-ink', 'bg-white');
    expect(input).toHaveAttribute('maxLength', '80');
  });

  it('shows the failed state as a framed warning alert with primary retry and outline delete', async () => {
    mockResume({
      title: 'Broken',
      processed_resume: null,
      raw_resume: { content: '', processing_status: 'failed' },
    });
    const { container } = render(<ResumeViewerPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('border-warning', 'bg-warning-tint');
    expect(alert).toHaveTextContent('resumeViewer.errors.processingFailed');
    expect(container.firstChild as HTMLElement).toHaveClass('bg-blueprint');
    expect(screen.getByRole('button', { name: 'resumeViewer.retryProcessing' })).toHaveClass(
      'bg-primary'
    );
    const remove = screen.getByRole('button', { name: 'resumeViewer.deleteAndStartOver' });
    expect(remove).toHaveClass('border-destructive', 'text-destructive');
    expect(remove).not.toHaveClass('bg-destructive');
  });

  it('shows the loading state left-aligned inside the frame', () => {
    mockedFetch.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ResumeViewerPage />);

    const frame = container.firstChild as HTMLElement;
    expect(frame).toHaveClass('bg-blueprint');
    expect(frame.querySelector('svg.animate-spin')).not.toBeNull();
    const label = within(frame).getByText('resumeViewer.loading');
    expect(label).toHaveClass('font-mono', 'text-primary');
    expect(label.closest('.justify-center')).toBe(frame);
  });
});
