import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from '@/app/(default)/dashboard/page';
import type { fetchResume, ResumeListItem } from '@/lib/api/resume';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  setDefault: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
  setHasMaster: vi.fn(),
  llmConfigured: true,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: { status?: string }) =>
      params?.status ? `${key}:${params.status}` : key,
    locale: 'en',
  }),
}));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { llm_configured: api.llmConfigured },
    isLoading: false,
    incrementResumes: vi.fn(),
    decrementResumes: vi.fn(),
    setHasMasterResume: api.setHasMaster,
  }),
}));
vi.mock('@/lib/api/resume', () => ({
  MAX_MASTER_RESUMES: 5,
  fetchResumeList: (...args: unknown[]) => api.list(...args),
  fetchResume: (...args: unknown[]) => api.get(...args),
  setDefaultMasterResume: (...args: unknown[]) => api.setDefault(...args),
  deleteResume: (...args: unknown[]) => api.remove(...args),
  retryProcessing: vi.fn(),
  fetchJobDescription: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/components/dashboard/resume-upload-dialog', () => ({
  ResumeUploadDialog: ({
    open,
    onUploadComplete,
    onOpenChange,
    becomesDefault,
  }: {
    open: boolean;
    onUploadComplete: (id: string) => void;
    onOpenChange: (open: boolean) => void;
    becomesDefault?: boolean;
  }) => (
    <>
      <button onClick={() => onUploadComplete('uploaded')}>finish upload</button>
      <button onClick={() => onOpenChange(false)}>close upload</button>
      <output data-testid="upload-open">{String(open)}</output>
      <output data-testid="upload-becomes-default">{String(Boolean(becomesDefault))}</output>
    </>
  ),
}));
vi.mock('@/components/dashboard/master-resume-choice-dialog', () => ({
  MasterResumeChoiceDialog: ({ open }: { open: boolean }) =>
    open ? <div>choice dialog open</div> : null,
}));

function row(id: string, master = false): ResumeListItem {
  return {
    resume_id: id,
    title: id,
    filename: `${id}.pdf`,
    is_master: master,
    is_default_master: false,
    processing_status: 'ready',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    parent_id: null,
  };
}

type ResumeResponse = Awaited<ReturnType<typeof fetchResume>>;
function status(
  value: ResumeResponse['raw_resume']['processing_status'] = 'ready'
): ResumeResponse {
  return {
    resume_id: 'm1',
    processed_resume: { personalInfo: { name: 'Ada' } },
    raw_resume: {
      id: 1,
      content: 'Ada',
      content_type: 'text/plain',
      created_at: '2026-01-01',
      processing_status: value,
    },
  };
}

/** The tile link is a real, focusable anchor with a visible focus treatment. */
function expectKeyboardLink(name: string, href: string): HTMLElement {
  const link = screen.getByRole('link', { name });
  expect(link).toHaveAttribute('href', href);
  link.focus();
  expect(link).toHaveFocus();
  // outline-none alone would leave the tile with no focus indicator (spec §8.1).
  expect(link.className).toMatch(/focus-visible:\S*ring-2/);
  return link;
}

describe('dashboard tiles are keyboard-reachable', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    api.llmConfigured = true;
    api.get.mockResolvedValue(status());
  });
  afterEach(() => vi.useRealTimers());

  it('exposes every resume tile as a link to its viewer, with actions outside the link', async () => {
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true, title: 'DevRel' },
      { ...row('m2', true), title: 'Solutions Eng' },
      { ...row('child'), parent_id: 'm1', title: 'Tailored for Acme' },
    ]);
    render(<DashboardPage />);
    await screen.findByText('Solutions Eng');

    expectKeyboardLink('DevRel', '/resumes/m1');
    const extra = expectKeyboardLink('Solutions Eng', '/resumes/m2');
    expectKeyboardLink('Tailored for Acme', '/resumes/child');

    for (const name of ['dashboard.setDefault', 'dashboard.duplicate']) {
      const action = screen.getByRole('button', { name });
      expect(extra.contains(action)).toBe(false);
      expect(action.closest('a')).toBeNull();
    }
  });

  it('keeps the default tile recovery buttons outside its link', async () => {
    api.get.mockResolvedValue(status('failed'));
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true, processing_status: 'failed' as const },
    ]);
    render(<DashboardPage />);
    await screen.findByRole('button', { name: 'dashboard.deleteAndReupload' });

    const link = expectKeyboardLink('m1', '/resumes/m1');
    const actions = [
      ...screen.getAllByRole('button', { name: 'dashboard.retryProcessing' }),
      screen.getByRole('button', { name: 'dashboard.deleteAndReupload' }),
    ];
    expect(actions).toHaveLength(3);
    for (const action of actions) {
      expect(link.contains(action)).toBe(false);
      expect(action.closest('a')).toBeNull();
    }
  });

  it('makes the add-track tile a native button', async () => {
    api.list.mockResolvedValue([{ ...row('m1', true), is_default_master: true }]);
    render(<DashboardPage />);
    const tile = await screen.findByRole('button', { name: 'dashboard.addMasterTrack' });
    expect(tile.tagName).toBe('BUTTON');
    expect(tile).toHaveAttribute('type', 'button');
  });

  it('makes the initialize tile a native button', async () => {
    api.list.mockResolvedValue([]);
    render(<DashboardPage />);
    const tile = await screen.findByRole('button', { name: 'dashboard.initializeMasterResume' });
    expect(tile.tagName).toBe('BUTTON');
    expect(tile).toHaveAttribute('type', 'button');
  });
});
