import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardDetailModal } from '@/components/tracker/card-detail-modal';
import { ManualAddApplicationDialog } from '@/components/tracker/manual-add-application-dialog';
import { getApplicationDetail, type ApplicationDetail } from '@/lib/api/tracker';
import type { ResumeListItem } from '@/lib/api/resume';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key, locale: 'de' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/lib/api/tracker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/tracker')>()),
  getApplicationDetail: vi.fn(),
}));

const resume: ResumeListItem = {
  resume_id: 'r1',
  filename: 'cv.pdf',
  is_master: true,
  parent_id: null,
  processing_status: 'ready',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  title: 'Main CV',
};
vi.mock('@/lib/api/resume', () => ({ fetchResumeList: vi.fn(async () => [resume]) }));

const detail: ApplicationDetail = {
  application_id: 'a1',
  job_id: 'j1',
  resume_id: 'r2',
  master_resume_id: null,
  status: 'interview',
  company: 'ACME',
  role: 'Engineer',
  applied_at: '2026-03-15T00:00:00Z',
  notes: null,
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  job_content: 'Build things.',
  resume: null,
};

describe('ManualAddApplicationDialog', () => {
  it('names each select by its own label plus the current value', async () => {
    render(<ManualAddApplicationDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    expect(
      await screen.findByRole('button', { name: 'tracker.manualAdd.resume Main CV' })
    ).toHaveAttribute('aria-haspopup', 'listbox');
    expect(
      screen.getByRole('button', { name: 'tracker.manualAdd.status tracker.columns.applied' })
    ).toHaveAttribute('aria-haspopup', 'listbox');
  });
});

describe('CardDetailModal', () => {
  it('shows the stage, a UI-locale date and a missing-resume warning', async () => {
    vi.mocked(getApplicationDetail).mockResolvedValue(detail);
    render(<CardDetailModal applicationId="a1" open onOpenChange={vi.fn()} onUpdated={vi.fn()} />);

    expect(await screen.findByText('tracker.columns.interview')).toBeInTheDocument();
    const expected = new Intl.DateTimeFormat('de', { month: 'short', year: 'numeric' }).format(
      new Date(detail.applied_at as string)
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('tracker.modal.resumeUnavailable');
  });
});
