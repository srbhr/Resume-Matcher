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
  expectWhiteRing(link, 'focus-visible:after:');
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

// getAttribute, not className: an SVG's className is an SVGAnimatedString.
const classAttr = (el: Element) => el.getAttribute('class') ?? '';
const classes = (el: Element) => classAttr(el).split(/\s+/);

/**
 * Owner ruling (round 2): hover or keyboard focus inside a tile fills it Hyper Blue and turns its
 * text white. There is no ink outline (Card interactive's hover:border-ink is overridden, so the
 * border stays transparent) and no 1px press-in.
 */
function expectBlueFillTile(card: HTMLElement): void {
  expect(classes(card)).toEqual(
    expect.arrayContaining([
      'hover:bg-primary',
      'has-[:focus-visible]:bg-primary',
      'hover:text-white',
      'has-[:focus-visible]:text-white',
      'hover:border-transparent',
      'hover:translate-x-0',
      'hover:translate-y-0',
    ])
  );
  expect(card.className).not.toMatch(/border-ink/);
  expect(card.className).not.toMatch(/translate-[xy]-px/);
  expect(card.className).not.toMatch(/bg-white/);
}

/** An element with its own colour flips to white through the tile's hover and focus state. */
function expectTurnsWhite(el: Element, property: 'text' | 'border' = 'text'): void {
  expect(classes(el)).toEqual(
    expect.arrayContaining([
      `group-hover:${property}-white`,
      `group-has-[:focus-visible]:${property}-white`,
    ])
  );
  // The element may rest in primary, but the tile must never turn it primary.
  expect(classAttr(el)).not.toContain(`group-hover:${property}-primary`);
}

/** StatusIndicator keeps its colours on its two spans, so the tile recolours them from outside. */
function expectStatusTurnsWhite(label: HTMLElement): void {
  expect(classes(label.parentElement as HTMLElement)).toEqual(
    expect.arrayContaining([
      'group-hover:[&>span:first-child]:bg-white',
      'group-hover:[&>span:last-child]:text-white',
      'group-has-[:focus-visible]:[&>span:first-child]:bg-white',
      'group-has-[:focus-visible]:[&>span:last-child]:text-white',
    ])
  );
}

/** The focus ring is white: a primary ring would vanish on the blue fill. */
function expectWhiteRing(el: HTMLElement, prefix = ''): void {
  expect(classes(el)).toEqual(
    expect.arrayContaining([`${prefix}ring-2`, `${prefix}ring-inset`, `${prefix}ring-white`])
  );
  expect(classes(el)).not.toContain(`${prefix}ring-primary`);
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

  it('keeps a white focus ring on every tile action button, which sits on the blue fill', async () => {
    api.get.mockResolvedValue(status('failed'));
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true, processing_status: 'failed' as const },
      { ...row('m2', true), title: 'Solutions Eng' },
    ]);
    render(<DashboardPage />);
    await screen.findByRole('button', { name: 'dashboard.deleteAndReupload' });

    // The Button primitive rings in primary with a canvas offset, which vanishes on the blue
    // fill a focused tile takes; tailwind-merge swaps it for white at each call site.
    const actions = [
      screen.getByRole('button', { name: 'dashboard.setDefault' }),
      screen.getByRole('button', { name: 'dashboard.duplicate' }),
      ...screen.getAllByRole('button', { name: 'dashboard.retryProcessing' }),
      screen.getByRole('button', { name: 'dashboard.deleteAndReupload' }),
    ];
    expect(actions).toHaveLength(5);
    for (const action of actions) {
      expect(classes(action)).toContain('focus-visible:ring-white');
      expect(classes(action)).not.toContain('focus-visible:ring-primary');
    }
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
      { ...row('m3', true), title: 'Product Eng' },
      {
        ...row('child2'),
        parent_id: 'm1',
        title: 'Tailored for Beta',
        processing_status: 'processing' as const,
      },
    ]);
    render(<DashboardPage />);
    await screen.findByText('Solutions Eng');

    for (const [title, label, square] of [
      ['Solutions Eng', 'dashboard.status.failed', 'bg-destructive'],
      ['Tailored for Acme', 'dashboard.status.pending', 'bg-steel'],
      ['Product Eng', 'dashboard.status.ready', 'bg-success'],
      ['Tailored for Beta', 'dashboard.status.processing', 'bg-primary'],
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

  it('fills resume tiles Hyper Blue and turns their text, status and marks white', async () => {
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true, title: 'DevRel' },
      { ...row('m2', true), title: 'Solutions Eng' },
      { ...row('child'), parent_id: 'm1', title: 'Tailored for Acme' },
    ]);
    render(<DashboardPage />);
    await screen.findByText('Solutions Eng');

    for (const [name, status] of [
      ['DevRel', /dashboard\.statusLine/],
      ['Solutions Eng', /dashboard\.status\.ready/],
      ['Tailored for Acme', /dashboard\.status\.ready/],
    ] as const) {
      const link = screen.getByRole('link', { name });
      const tile = link.closest('.group') as HTMLElement;
      expectBlueFillTile(tile);
      // The title inherits the tile's white, so it must not carry a colour of its own.
      expect(link.closest('h3')!.className).not.toMatch(/text-(?:primary|steel|ink|white)/);
      expectStatusTurnsWhite(within(tile).getByText(status));
      // The monogram square rests in an ink frame and turns white so primary fills do not vanish.
      expectTurnsWhite(tile.querySelector('.size-12')!, 'border');
    }

    const defaultTile = screen.getByRole('link', { name: 'DevRel' }).closest('.group')!;
    expectTurnsWhite(
      within(defaultTile as HTMLElement).getByText('dashboard.defaultBadge'),
      'border'
    );
    const tailored = screen.getByRole('link', { name: 'Tailored for Acme' }).closest('.group')!;
    expectTurnsWhite(within(tailored as HTMLElement).getByText(/dashboard\.edited/));
  });

  it('keeps the add-track limit, spinner and retry icon readable on the blue fill', async () => {
    api.get.mockResolvedValue(status('processing'));
    api.list.mockResolvedValue([
      { ...row('m1', true), is_default_master: true, processing_status: 'processing' as const },
    ]);
    render(<DashboardPage />);
    const addTrack = await screen.findByRole('button', { name: 'dashboard.addMasterTrack' });

    expectBlueFillTile(addTrack.closest('.group') as HTMLElement);
    expectTurnsWhite(screen.getByText('dashboard.masterLimitReached'));
    expectWhiteRing(addTrack, 'focus-visible:');

    // Steel/primary spinner and the ink icon-only retry button would fall below AA on blue.
    const defaultTile = screen.getByRole('link', { name: 'm1' }).closest('.group') as HTMLElement;
    expectTurnsWhite(defaultTile.querySelector('svg.animate-spin')!);
    const retry = screen.getAllByRole('button', { name: 'dashboard.retryProcessing' })[0];
    expectTurnsWhite(retry);
    // Its ghost hover fill is panel, which white would vanish on: the hover fill turns blue instead.
    expect(classes(retry)).toContain('group-hover:hover:bg-primary-hover');
  });

  it('fills the initialize tile Hyper Blue, with its + square and caption turning white', async () => {
    api.list.mockResolvedValue([]);
    render(<DashboardPage />);
    const tile = await screen.findByRole('button', { name: 'dashboard.initializeMasterResume' });

    expectBlueFillTile(tile.closest('.group') as HTMLElement);
    expectWhiteRing(tile, 'focus-visible:');
    expectTurnsWhite(tile.querySelector('svg')!.parentElement!, 'border');
    expectTurnsWhite(screen.getByText(/dashboard\.initializeSequence/));
  });

  it('fills the setup tile Hyper Blue on hover and keyboard focus, with no outline', async () => {
    api.llmConfigured = false;
    api.list.mockResolvedValue([]);
    render(<DashboardPage />);
    const link = await screen.findByRole('link', { name: /dashboard\.setupRequiredTitle/ });
    expect(link).toHaveAttribute('href', '/settings');
    const card = link.firstElementChild as HTMLElement;

    expect(classes(card)).toEqual(
      expect.arrayContaining([
        'hover:bg-primary',
        'group-focus-visible/setup:bg-primary',
        'hover:text-white',
        'group-focus-visible/setup:text-white',
        'hover:border-transparent',
        'group-focus-visible/setup:border-transparent',
        'hover:translate-x-0',
        'group-focus-visible/setup:translate-x-0',
      ])
    );
    expect(card.className).not.toMatch(/border-ink|translate-[xy]-px|bg-white/);
    expectWhiteRing(card, 'group-focus-visible/setup:');
    for (const text of [
      screen.getByText('dashboard.setupRequiredTitle'),
      screen.getByText('dashboard.setupRequiredMessage'),
      screen.getByText('nav.goToSettings').parentElement!,
      card.querySelector('svg')!,
    ]) {
      expect(text.getAttribute('class')).toMatch(/group-hover:text-white/);
      expect(text.getAttribute('class')).toMatch(/group-focus-visible\/setup:text-white/);
    }
  });

  it('makes Create tailored resume the one blue primary at rest, inverted on the blue tile', async () => {
    api.list.mockResolvedValue([{ ...row('m1', true), is_default_master: true }]);
    render(<DashboardPage />);
    const label = await screen.findByText('dashboard.createResume');
    const create = within(label.parentElement!).getByRole('button');
    expect(classes(create)).toContain('bg-primary');
    expect(document.querySelectorAll('button.bg-primary, a.bg-primary')).toHaveLength(1);

    // Hover or focus fills the tile blue, so the primary button inverts to a white square.
    const tile = create.closest('.group') as HTMLElement;
    expectBlueFillTile(tile);
    expect(classes(create)).toEqual(
      expect.arrayContaining([
        'hover:bg-white',
        'hover:text-primary',
        'group-has-[:focus-visible]:bg-white',
        'group-has-[:focus-visible]:text-primary',
        'focus-visible:ring-white',
      ])
    );
    expect(classes(create)).not.toContain('hover:bg-primary-hover');
    expect(classes(create)).not.toContain('focus-visible:ring-primary');
    expectTurnsWhite(label);
    // The tile is a hover target, so the whole tile must also be the click target.
    expect(classes(create)).toEqual(
      expect.arrayContaining(['static', 'after:absolute', 'after:inset-0'])
    );
  });

  it('does not light up the Create tile while tailoring is unavailable', async () => {
    api.list.mockResolvedValue([]);
    render(<DashboardPage />);
    const label = await screen.findByText('dashboard.createResume');
    const create = within(label.parentElement!).getByRole('button');
    expect(create).toBeDisabled();
    expect(create.closest('.group')).toBeNull();
    expect(create.parentElement!.parentElement!.className).not.toMatch(/hover:bg-primary/);
  });
});
