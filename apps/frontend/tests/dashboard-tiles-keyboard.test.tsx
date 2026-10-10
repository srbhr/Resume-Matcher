import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  // Stretched link: the ::after overlay covers the whole tile, so the tile itself navigates.
  expect(link.className).toMatch(/(^|\s)after:absolute(\s|$)/);
  expect(link.className).toMatch(/(^|\s)after:inset-0(\s|$)/);
  return link;
}

/** A tile action sits outside the tile link and above its overlay, so it keeps its own clicks. */
function expectActionAboveLink(action: HTMLElement, link: HTMLElement): void {
  expect(link.contains(action)).toBe(false);
  expect(action.closest('a')).toBeNull();
  expect(action.className).toMatch(/(^|\s)z-10(\s|$)/);
}

const classes = (el: Element) => el.className.split(/\s+/);

/** Owner ruling: hover or keyboard focus lifts a tile to white with an ink frame; no blue fill. */
function expectWhiteLiftTile(card: HTMLElement): void {
  expect(classes(card)).toEqual(
    expect.arrayContaining(['hover:bg-white', 'has-[:focus-visible]:bg-white'])
  );
  expect(classes(card)).toContain('has-[:focus-visible]:border-ink');
  expect(card.className).not.toMatch(/bg-primary/);
  expect(card.querySelector('[class*="hover:bg-primary"]')).toBeNull();
}

/** Only through the tile's hover/focus state does an element turn primary; it rests in ink. */
function expectAccentOnly(el: Element, property: 'text' | 'border' = 'text'): void {
  expect(classes(el)).toEqual(
    expect.arrayContaining([
      `group-hover:${property}-primary`,
      `group-has-[:focus-visible]:${property}-primary`,
    ])
  );
  expect(classes(el)).not.toContain(`${property}-primary`);
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
      expectActionAboveLink(screen.getByRole('button', { name }), extra);
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
    for (const action of actions) expectActionAboveLink(action, link);
  });

  it('lifts every tile action row above the link overlay so disabled clicks cannot fall through', async () => {
    api.get.mockResolvedValue(status('failed'));
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true, processing_status: 'failed' as const },
      { ...row('m2', true), title: 'Solutions Eng' },
    ]);
    render(<DashboardPage />);
    await screen.findByRole('button', { name: 'dashboard.deleteAndReupload' });

    // A disabled Button has pointer-events-none, so its click lands on whatever is under it:
    // the wrapper must carry z-10 itself, or the stretched ::after opens the resume.
    const wrappers = [
      screen.getByRole('button', { name: 'dashboard.deleteAndReupload' }).parentElement!,
      screen.getByRole('button', { name: 'dashboard.setDefault' }).parentElement!,
      screen.getByRole('button', { name: 'dashboard.duplicate' }).parentElement!,
      screen.getAllByRole('button', { name: 'dashboard.retryProcessing' })[0].parentElement!,
    ];
    for (const wrapper of wrappers) {
      expect(classes(wrapper)).toEqual(expect.arrayContaining(['relative', 'z-10']));
    }
    // Action rows shrink to their buttons, so they never cover the rest of the tile's link.
    expect(classes(wrappers[0])).toContain('w-fit');
    expect(classes(wrappers[1])).toContain('w-fit');
  });

  it('shows a translated StatusIndicator, not the raw status enum, on every tile', async () => {
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true },
      { ...row('m2', true), title: 'Solutions Eng', processing_status: 'failed' as const },
      {
        ...row('child'),
        parent_id: 'm1',
        title: 'Tailored for Acme',
        processing_status: 'pending' as const,
      },
    ]);
    render(<DashboardPage />);
    await screen.findByText('Solutions Eng');

    for (const [title, label, square] of [
      ['Solutions Eng', 'dashboard.status.failed', 'bg-destructive'],
      ['Tailored for Acme', 'dashboard.status.pending', 'bg-steel'],
    ]) {
      const tile = screen.getByRole('link', { name: title }).closest('.group') as HTMLElement;
      const text = within(tile).getByText(label);
      expect(text.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
      expect(text.previousElementSibling!.className).toContain(square);
      expect(within(tile).queryByText(/^(pending|processing|ready|failed)$/)).toBeNull();
    }
  });

  it('keeps heading levels in order and the footer logo decorative', async () => {
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true, title: 'DevRel' },
      { ...row('child'), parent_id: 'm1', title: 'Tailored for Acme' },
    ]);
    render(<DashboardPage />);
    await screen.findByText('Tailored for Acme');

    // h1 -> h2 -> h3: the tile titles (h3) must follow a section heading, not skip a level.
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    expect(levels.slice(1, levels.indexOf(3))).toContain(2);
    const section = screen.getByRole('heading', { level: 2 });
    const firstTile = screen.getAllByRole('heading', { level: 3 })[0];
    expect(
      section.compareDocumentPosition(firstTile) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // The visible "Resume Matcher" text next to the logo already names it.
    expect(screen.queryByAltText('Resume Matcher')).toBeNull();
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

describe('dashboard tile highlight and the one blue action', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    api.llmConfigured = true;
    api.get.mockResolvedValue(status());
  });

  it('lifts resume and add-track tiles to white, with only the title and + mark in primary', async () => {
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true, title: 'DevRel' },
      { ...row('m2', true), title: 'Solutions Eng' },
      { ...row('child'), parent_id: 'm1', title: 'Tailored for Acme' },
    ]);
    render(<DashboardPage />);
    const addTrack = await screen.findByRole('button', { name: 'dashboard.addMasterTrack' });

    for (const name of ['DevRel', 'Solutions Eng', 'Tailored for Acme']) {
      const link = screen.getByRole('link', { name });
      expectWhiteLiftTile(link.closest('.group') as HTMLElement);
      expectAccentOnly(link.closest('h3')!);
    }

    expectWhiteLiftTile(addTrack.closest('.group') as HTMLElement);
    expectAccentOnly(screen.getByText('dashboard.addMasterTrack'));
    expect(screen.getByText('dashboard.masterLimitReached').className).not.toMatch(/primary/);
  });

  it('lifts the initialize tile to white and accents only its title and + square', async () => {
    api.list.mockResolvedValue([]);
    render(<DashboardPage />);
    const tile = await screen.findByRole('button', { name: 'dashboard.initializeMasterResume' });

    expectWhiteLiftTile(tile.closest('.group') as HTMLElement);
    expectAccentOnly(screen.getByText('dashboard.initializeMasterResume'));
    const plusSquare = tile.querySelector('svg')!.parentElement!;
    expectAccentOnly(plusSquare);
    expectAccentOnly(plusSquare, 'border');
    expect(screen.getByText(/dashboard\.initializeSequence/).className).not.toMatch(
      /primary|canvas/
    );
  });

  it('lifts the setup tile to white on hover and keyboard focus', async () => {
    api.llmConfigured = false;
    api.list.mockResolvedValue([]);
    render(<DashboardPage />);
    const link = await screen.findByRole('link', { name: /dashboard\.setupRequiredTitle/ });
    expect(link).toHaveAttribute('href', '/settings');
    const card = link.firstElementChild as HTMLElement;

    expect(classes(card)).toEqual(
      expect.arrayContaining([
        'hover:bg-white',
        'group-focus-visible/setup:bg-white',
        'group-focus-visible/setup:border-ink',
      ])
    );
    expect(card.className).not.toMatch(/bg-primary/);
    const title = screen.getByText('dashboard.setupRequiredTitle');
    expect(classes(title)).toEqual(
      expect.arrayContaining(['group-hover:text-primary', 'group-focus-visible/setup:text-primary'])
    );
  });

  it('makes Create tailored resume the one blue primary', async () => {
    api.list.mockResolvedValue([{ ...row('m1', true), is_default_master: true }]);
    render(<DashboardPage />);
    const create = within(
      (await screen.findByText('dashboard.createResume')).parentElement!
    ).getByRole('button');
    expect(classes(create)).toContain('bg-primary');
    expect(document.querySelectorAll('button.bg-primary, a.bg-primary')).toHaveLength(1);
  });
});
