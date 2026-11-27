import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DashboardPage from '@/app/(default)/dashboard/page';
import type { fetchResume, ResumeListItem } from '@/lib/api/resume';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  duplicate: vi.fn(),
  download: vi.fn(),
  saveFile: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${Object.values(params).join('|')}` : key,
    locale: 'en',
  }),
}));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { llm_configured: true },
    isLoading: false,
    incrementResumes: vi.fn(),
    decrementResumes: vi.fn(),
    setHasMasterResume: vi.fn(),
  }),
}));
vi.mock('@/lib/api/resume', () => ({
  MAX_MASTER_RESUMES: 5,
  fetchResumeList: (...args: unknown[]) => api.list(...args),
  fetchResume: (...args: unknown[]) => api.get(...args),
  deleteResume: (...args: unknown[]) => api.remove(...args),
  duplicateResume: (...args: unknown[]) => api.duplicate(...args),
  downloadResumePdf: (...args: unknown[]) => api.download(...args),
  setDefaultMasterResume: vi.fn(),
  retryProcessing: vi.fn(),
  fetchJobDescription: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/utils/download', () => ({
  downloadBlobAsFile: (...args: unknown[]) => api.saveFile(...args),
  sanitizeFilename: (title: string) => `${title}.pdf`,
}));
vi.mock('@/components/ui/toast', () => ({ toast: { success: api.toast } }));
vi.mock('@/components/dashboard/resume-upload-dialog', () => ({ ResumeUploadDialog: () => null }));
vi.mock('@/components/dashboard/master-resume-choice-dialog', () => ({
  MasterResumeChoiceDialog: () => null,
}));

function row(id: string, extra: Partial<ResumeListItem> = {}): ResumeListItem {
  return {
    resume_id: id,
    title: id,
    filename: `${id}.pdf`,
    is_master: false,
    is_default_master: false,
    processing_status: 'ready',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    parent_id: 'm1',
    ...extra,
  };
}
const master = row('m1', { is_master: true, is_default_master: true, parent_id: null });

type ResumeResponse = Awaited<ReturnType<typeof fetchResume>>;
const ready: ResumeResponse = {
  resume_id: 'm1',
  processed_resume: { personalInfo: { name: 'Ada' } },
  raw_resume: {
    id: 1,
    content: 'Ada',
    content_type: 'text/plain',
    created_at: '2026-01-01',
    processing_status: 'ready',
  },
};

const tile = (title: string) =>
  screen.getByRole('link', { name: title }).closest('.group') as HTMLElement;
const tailoredOrder = () =>
  screen
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent)
    .filter((text) => text?.startsWith('T-'));

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  api.get.mockResolvedValue(ready);
});
afterEach(() => vi.useRealTimers());

describe('dashboard groups', () => {
  it('labels the Masters and Tailored groups, with Add master track the last master cell', async () => {
    api.list.mockResolvedValue([master, row('T-one')]);
    render(<DashboardPage />);
    await screen.findByText('T-one');

    const [masters, tailored] = screen
      .getAllByRole('heading', { level: 2 })
      .filter((h) => h.textContent?.startsWith('dashboard.groups'));
    expect(masters).toHaveTextContent('dashboard.groups.masters:1|5');
    expect(tailored).toHaveTextContent('dashboard.groups.tailored:1');
    // Each label row spans the grid.
    expect(masters.parentElement).toHaveClass('col-span-full');

    const addTrack = screen.getByRole('button', { name: 'dashboard.addMasterTrack' });
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(masters, addTrack)).toBe(true);
    expect(follows(addTrack, tailored)).toBe(true);
    expect(follows(tailored, screen.getByText('T-one'))).toBe(true);
  });

  it('finishes each group row with hatched cells at 2, 3, 4 and 5 columns', async () => {
    // Masters holds two cells: the default and Add master track.
    api.list.mockResolvedValue([master, row('T-one')]);
    const { container } = render(<DashboardPage />);
    await screen.findByText('T-one');

    const masters = screen.getByText('dashboard.groups.masters:1|5').parentElement!;
    const tailored = screen.getByText('dashboard.groups.tailored:1').parentElement!;
    const fillers = Array.from(
      container.querySelectorAll('div[class~="pointer-events-none"][class~="aspect-5/4"]')
    );
    const between = fillers.filter(
      (cell) =>
        masters.compareDocumentPosition(cell) & Node.DOCUMENT_POSITION_FOLLOWING &&
        cell.compareDocumentPosition(tailored) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    // 2 cells: none at 2 columns, 1 at 3, 2 at 4, 3 at 5.
    expect(
      between.map((cell) => (cell.getAttribute('class') ?? '').match(/@\w+:(?:block|hidden)/g))
    ).toEqual([
      ['@2xl:hidden', '@3xl:block', '@5xl:block', '@7xl:block'],
      ['@2xl:hidden', '@3xl:hidden', '@5xl:block', '@7xl:block'],
      ['@2xl:hidden', '@3xl:hidden', '@5xl:hidden', '@7xl:block'],
    ]);
    for (const cell of between) expect(cell).toHaveClass('hidden');

    // 1 tailored tile: the row's rest plus one spare row (1+2 at 2 columns, 2+3 at 3, 3+4 at
    // 4, 4+5 at 5).
    const after = fillers.filter(
      (cell) => tailored.compareDocumentPosition(cell) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(after).toHaveLength(9);
    expect(after.filter((cell) => cell.className.includes('@2xl:block'))).toHaveLength(3);
    expect(after.filter((cell) => cell.className.includes('@3xl:block'))).toHaveLength(5);
    expect(after.filter((cell) => cell.className.includes('@5xl:block'))).toHaveLength(7);
    expect(after.filter((cell) => cell.className.includes('@7xl:block'))).toHaveLength(9);
  });

  it('colours squares by kind: masters blue, tailored ink', async () => {
    api.list.mockResolvedValue([master, row('T-one')]);
    render(<DashboardPage />);
    await screen.findByText('T-one');

    expect(tile('m1').querySelector('.size-12')).toHaveClass('bg-primary');
    expect(tile('T-one').querySelector('.size-12')).toHaveClass('bg-ink');
  });

  it('shows status only when it needs attention, titles on three lines, the full title on hover', async () => {
    const long = `T-${'Senior Staff Engineer '.repeat(6).trim()}`;
    api.list.mockResolvedValue([
      master,
      row('T-ready', { title: long }),
      row('T-failed', { processing_status: 'failed' }),
    ]);
    render(<DashboardPage />);
    await screen.findByText('T-failed');

    const titleLink = screen.getByRole('link', { name: long });
    expect(titleLink).toHaveClass('line-clamp-3');
    expect(titleLink).toHaveAttribute('title', long);
    expect(within(tile(long)).queryByText(/dashboard\.status\./)).toBeNull();
    expect(within(tile('T-failed')).getByText('dashboard.status.failed')).toBeInTheDocument();
    // The default master's Ready stays for screen readers only.
    expect(screen.getByText(/dashboard\.statusLine/).closest('.sr-only')).not.toBeNull();
  });

  it('dates each tile relative to the load, with the exact date on hover, then its template and page size', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-03T00:00:00Z'));
    api.list.mockResolvedValue([
      master,
      row('T-one', {
        template_settings: { ...DEFAULT_TEMPLATE_SETTINGS, template: 'modern', pageSize: 'LETTER' },
      }),
      row('T-two', { template_settings: null }),
    ]);
    render(<DashboardPage />);
    await screen.findByText('T-one');

    const edited = within(tile('T-one')).getByText('dashboard.edited:2 days ago');
    expect(edited).toHaveAttribute('title', 'Nov 01, 2026');
    expect(
      within(tile('T-one')).getByText(
        'builder.formatting.templates.modern.name · builder.pageSize.usLetter'
      )
    ).toBeInTheDocument();
    // No saved settings: the defaults.
    expect(
      within(tile('T-two')).getByText('builder.formatting.templates.swissSingle.name · A4')
    ).toBeInTheDocument();
  });
});

describe('dashboard tailored order and filter', () => {
  const tailored = [
    row('T-beta', { updated_at: '2026-11-03T00:00:00Z' }),
    row('T-alpha', { updated_at: '2026-11-01T00:00:00Z' }),
    row('T-gamma', { updated_at: '2026-11-05T00:00:00Z', parent_id: 'm2' }),
  ];

  it('orders by most recently edited, or A to Z', async () => {
    api.list.mockResolvedValue([master, ...tailored]);
    render(<DashboardPage />);
    await screen.findByText('T-beta');

    expect(tailoredOrder()).toEqual(['T-gamma', 'T-beta', 'T-alpha']);
    const sort = screen.getByRole('radiogroup', { name: 'dashboard.sort.label' });
    fireEvent.click(within(sort).getByRole('radio', { name: 'dashboard.sort.name' }));
    expect(tailoredOrder()).toEqual(['T-alpha', 'T-beta', 'T-gamma']);
  });

  it('offers a master filter only when there is more than one master', async () => {
    api.list.mockResolvedValue([master, ...tailored]);
    const { unmount } = render(<DashboardPage />);
    await screen.findByText('T-beta');
    expect(screen.queryByRole('button', { name: /dashboard\.filter\.all/ })).toBeNull();
    unmount();

    api.list.mockResolvedValue([
      master,
      row('m2', { is_master: true, parent_id: null, title: 'Second track' }),
      ...tailored,
    ]);
    render(<DashboardPage />);
    await screen.findByText('T-beta');
    // Named for what it does, then its value; the name stays off screen.
    const filter = screen.getByRole('button', {
      name: 'dashboard.filter.label dashboard.filter.all',
    });
    expect(screen.getByText('dashboard.filter.label')).toHaveClass('sr-only');
    fireEvent.click(filter);
    fireEvent.click(screen.getByRole('option', { name: 'Second track' }));

    expect(tailoredOrder()).toEqual(['T-gamma']);
    expect(screen.getByText('dashboard.groups.tailored:1')).toBeInTheDocument();
  });

  it('says so when there are no tailored resumes', async () => {
    api.list.mockResolvedValue([master]);
    render(<DashboardPage />);
    expect(await screen.findByText('dashboard.noTailored')).toBeInTheDocument();
    expect(screen.getByText('dashboard.groups.tailored:0')).toBeInTheDocument();
  });
});

describe('dashboard tile quick actions', () => {
  const settings = { ...DEFAULT_TEMPLATE_SETTINGS, template: 'modern' as const };

  beforeEach(() => {
    api.list.mockResolvedValue([master, row('T-one', { template_settings: settings })]);
  });

  it('opens, edits and downloads from the tile, above its stretched link', async () => {
    api.download.mockResolvedValue(new Blob(['%PDF']));
    render(<DashboardPage />);
    await screen.findByText('T-one');
    const t1 = tile('T-one');

    const open = within(t1).getByRole('link', { name: 'dashboard.tileActions.open:T-one' });
    expect(open).toHaveAttribute('href', '/resumes/T-one');
    expect(
      within(t1).getByRole('link', { name: 'dashboard.tileActions.edit:T-one' })
    ).toHaveAttribute('href', '/builder?id=T-one');
    // Revealed by opacity, so the keyboard still reaches them.
    expect(open).toHaveClass('opacity-0', 'group-hover:opacity-100', 'focus-visible:opacity-100');
    // Hidden, it takes no taps: on a touch screen the tile opens instead.
    expect(open).toHaveClass('pointer-events-none', 'group-hover:pointer-events-auto');
    expect(open.parentElement).toHaveClass('relative', 'z-10');

    fireEvent.click(
      within(t1).getByRole('button', { name: 'dashboard.tileActions.download:T-one' })
    );
    await waitFor(() => expect(api.toast).toHaveBeenCalledWith('builder.alerts.downloadSuccess'));
    // With the tile's own saved settings.
    expect(api.download).toHaveBeenCalledWith('T-one', settings, 'en');
    expect(api.saveFile).toHaveBeenCalledWith(expect.any(Blob), 'T-one.pdf');
  });

  it('keeps the menu button visible on touch screens, which have no hover', async () => {
    render(<DashboardPage />);
    await screen.findByText('T-one');
    const more = await within(tile('T-one')).findByRole('button', {
      name: 'dashboard.tileActions.more:T-one',
    });
    expect(more).toHaveClass(
      'opacity-0',
      'pointer-coarse:opacity-100',
      'pointer-coarse:pointer-events-auto',
      'aria-expanded:opacity-100'
    );
  });

  it('duplicates from the menu and reloads the list', async () => {
    api.duplicate.mockResolvedValue({ resume_id: 'copy' });
    render(<DashboardPage />);
    await screen.findByText('T-one');
    fireEvent.click(
      await within(tile('T-one')).findByRole('button', {
        name: 'dashboard.tileActions.more:T-one',
      })
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'dashboard.duplicate' }));

    await waitFor(() => expect(api.duplicate).toHaveBeenCalledWith('T-one'));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('deletes from the menu only after confirming, then reloads the list', async () => {
    api.remove.mockResolvedValue(undefined);
    render(<DashboardPage />);
    await screen.findByText('T-one');
    fireEvent.click(
      await within(tile('T-one')).findByRole('button', {
        name: 'dashboard.tileActions.more:T-one',
      })
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'common.delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('confirmations.deleteResume');
    expect(api.remove).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'confirmations.deleteResumeConfirmLabel' })
      );
    });

    expect(api.remove).toHaveBeenCalledWith('T-one');
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('gives a processing tile its status instead of actions', async () => {
    api.list.mockResolvedValue([master, row('T-busy', { processing_status: 'processing' })]);
    render(<DashboardPage />);
    await screen.findByText('T-busy');
    expect(within(tile('T-busy')).queryByRole('button')).toBeNull();
    expect(within(tile('T-busy')).getByText('dashboard.status.processing')).toBeInTheDocument();
  });
});
