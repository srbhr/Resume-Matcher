import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Application } from '@/lib/api/tracker';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommandPaletteLauncher,
  openCommandPalette,
} from '@/components/common/command-palette-launcher';
// Loaded here first, so the launcher's dynamic import resolves from the module
// cache; transforming ui-sdk on first import outlasts findBy's one-second wait.
import '@/components/common/command-palette-content';

/**
 * Cmd+K / Ctrl+K opens a command palette on every (default) page: go to a page,
 * or open a resume. It is ui-sdk's Command in its Dialog, behind the Swiss
 * wrapper in components/ui, and loads on first use.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
// The App Router's next/dynamic, as in lazy-toaster.test.tsx.
vi.mock('next/dynamic', async () => await import('next/dist/api/app-dynamic'));
vi.mock('@/lib/api/resume', () => ({
  fetchResumeList: vi.fn(async () => [
    {
      resume_id: 'r1',
      title: 'Platform Engineer @ Acme',
      filename: 'acme.pdf',
      is_master: false,
      parent_id: 'm1',
      processing_status: 'ready',
      created_at: '',
      updated_at: '',
    },
    {
      resume_id: 'm1',
      title: null,
      filename: 'ada-cv.pdf',
      is_master: true,
      parent_id: null,
      processing_status: 'ready',
      created_at: '',
      updated_at: '',
    },
  ]),
}));
vi.mock('@/lib/api/tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/tracker')>();
  const columns = Object.fromEntries(
    actual.APPLICATION_STATUS_ORDER.map((s) => [s, [] as Partial<Application>[]])
  );
  columns.interview = [
    {
      application_id: 'a7',
      company: 'Harbor Ledger',
      role: 'Backend Engineer',
      status: 'interview',
    },
  ];
  return { ...actual, listApplications: vi.fn(async () => ({ columns })) };
});

const ctrlK = (target: Window | Element = window) =>
  act(() => {
    fireEvent.keyDown(target, { key: 'k', ctrlKey: true });
  });

async function openPalette() {
  render(<CommandPaletteLauncher />);
  await ctrlK();
  return screen.findByRole('dialog', { name: 'commandPalette.title' });
}

beforeEach(() => push.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('command palette', () => {
  it('opens on Ctrl+K and goes to the page a search narrows to', async () => {
    const dialog = await openPalette();
    const search = within(dialog).getByRole('combobox', { name: 'commandPalette.title' });

    fireEvent.change(search, { target: { value: 'settings' } });
    // Filtered-out commands stay in the DOM, hidden; a person sees only matches.
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['nav.settings']);
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(push).toHaveBeenCalledWith('/settings');
  });

  it('matches what was typed as written, not letters scattered across a title', async () => {
    const dialog = await openPalette();
    await within(dialog).findByText('Platform Engineer @ Acme');
    const search = within(dialog).getByRole('combobox', { name: 'commandPalette.title' });

    // P-f-m appear in order in "Platform", but nobody typing "pfm" means it.
    fireEvent.change(search, { target: { value: 'pfm' } });

    expect(within(dialog).queryAllByRole('option')).toEqual([]);
    expect(within(dialog).getByText('commandPalette.empty')).toBeInTheDocument();
  });

  it('lists the resumes, titled or by file name, and opens the one chosen', async () => {
    const dialog = await openPalette();

    expect(await within(dialog).findByText('ada-cv.pdf')).toBeInTheDocument();
    expect(within(dialog).getByText('commandPalette.master')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Platform Engineer @ Acme'));

    expect(push).toHaveBeenCalledWith('/resumes/r1');
  });

  it('lists tracked applications with their stage, and opens the card on the tracker', async () => {
    const dialog = await openPalette();

    const row = await within(dialog).findByText('Harbor Ledger · Backend Engineer');
    expect(within(dialog).getByText('tracker.columns.interview')).toBeInTheDocument();
    fireEvent.click(row);

    expect(push).toHaveBeenCalledWith('/tracker?open=a7');
  });

  it('leaves Ctrl+K to a handler that already used it (the editor inserts a link)', async () => {
    const editorShortcut = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener('keydown', editorShortcut);
    render(<CommandPaletteLauncher />);

    await ctrlK(document.body);

    expect(screen.queryByRole('dialog')).toBeNull();
    document.removeEventListener('keydown', editorShortcut);
  });

  it('opens from a button anywhere, like the dashboard Search', async () => {
    render(<CommandPaletteLauncher />);

    act(() => openCommandPalette());

    expect(await screen.findByRole('dialog', { name: 'commandPalette.title' })).toBeInTheDocument();
  });
});

describe('ui-sdk stays behind components/ui and off first load', () => {
  const root = path.join(__dirname, '..');
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.(tsx?|css)$/.test(name) ? [full] : [];
    });

  it('only components/ui wrappers import @ui-sdk', () => {
    const outside = ['app', 'components', 'hooks', 'lib']
      .flatMap((dir) => sources(path.join(root, dir)))
      .filter((file) => !file.startsWith(path.join(root, 'components', 'ui') + path.sep))
      .filter((file) => /from '@ui-sdk\/|@import '@ui-sdk\//.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file));

    expect(outside).toEqual([]);
  });

  it('the launcher in the layout loads the palette only on first use', () => {
    const launcher = readFileSync(
      path.join(root, 'components', 'common', 'command-palette-launcher.tsx'),
      'utf8'
    );
    expect(launcher).not.toMatch(
      /^import [^\n]*(@ui-sdk|command-palette-content|ui\/command-palette)/m
    );
    expect(launcher).toMatch(/import\('\.\/command-palette-content'\)/);
  });
});
