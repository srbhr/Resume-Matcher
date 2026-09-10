import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ManageColumnsDialog } from '@/components/tracker/manage-columns-dialog';
import { KanbanBoard } from '@/components/tracker/kanban-board';
import {
  APPLICATION_STATUS_ORDER,
  listApplications,
  type Application,
  type ApplicationColumns,
  type ApplicationStatus,
} from '@/lib/api/tracker';
import { TRACKER_HIDDEN_STATUSES_KEY } from '@/lib/utils/tracker-column-visibility';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/api/tracker', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/tracker')>('@/lib/api/tracker');
  return { ...actual, listApplications: vi.fn() };
});

// Wraps (does not replace) the real dialog so the board's `onToggle` can be
// invoked directly — the board must hold the "one visible column" invariant on
// its own, not only because the dialog disables the switch.
const boardDialog = vi.hoisted(() => ({
  onToggle: null as ((status: string) => void) | null,
}));

vi.mock('@/components/tracker/manage-columns-dialog', async () => {
  const actual = await vi.importActual<typeof import('@/components/tracker/manage-columns-dialog')>(
    '@/components/tracker/manage-columns-dialog'
  );
  return {
    ManageColumnsDialog: (props: Parameters<typeof actual.ManageColumnsDialog>[0]) => {
      boardDialog.onToggle = props.onToggle as (status: string) => void;
      return React.createElement(actual.ManageColumnsDialog, props);
    },
  };
});

const ALL_BUT_SAVED = APPLICATION_STATUS_ORDER.filter((status) => status !== 'saved');

function switchFor(status: ApplicationStatus): HTMLElement {
  return screen.getByRole('switch', { name: `tracker.columns.${status}` });
}

function rowFor(status: ApplicationStatus): HTMLElement {
  const row = switchFor(status).closest('div');
  if (!row) throw new Error(`no row rendered for ${status}`);
  return row;
}

function visibleColumns(): string[] {
  return Array.from(document.querySelectorAll('[data-column]')).map(
    (el) => el.getAttribute('data-column') ?? ''
  );
}

describe('ManageColumnsDialog', () => {
  it('renders one switch per tracker status', () => {
    render(
      <ManageColumnsDialog
        open
        onOpenChange={vi.fn()}
        hiddenStatuses={new Set(['interview'])}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getAllByRole('switch')).toHaveLength(7);
  });

  it('reports toggles with the status key', () => {
    const onToggle = vi.fn();
    render(
      <ManageColumnsDialog
        open
        onOpenChange={vi.fn()}
        hiddenStatuses={new Set(['interview'])}
        onToggle={onToggle}
      />
    );

    const interviewSwitch = switchFor('interview');
    expect(interviewSwitch).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(interviewSwitch);
    expect(onToggle).toHaveBeenCalledWith('interview');
  });

  it('describes each stage by its state, not by an action', () => {
    render(
      <ManageColumnsDialog
        open
        onOpenChange={vi.fn()}
        hiddenStatuses={new Set(['interview'])}
        onToggle={vi.fn()}
      />
    );

    expect(
      within(rowFor('interview')).getByText('tracker.manageDialog.hidden')
    ).toBeInTheDocument();
    expect(within(rowFor('applied')).getByText('tracker.manageDialog.visible')).toBeInTheDocument();
    expect(screen.getAllByText('tracker.manageDialog.hidden')).toHaveLength(1);
    expect(screen.getAllByText('tracker.manageDialog.visible')).toHaveLength(6);
  });

  it('locks the last visible stage and explains why', () => {
    const onToggle = vi.fn();
    render(
      <ManageColumnsDialog
        open
        onOpenChange={vi.fn()}
        hiddenStatuses={new Set(ALL_BUT_SAVED)}
        onToggle={onToggle}
      />
    );

    const lastVisible = switchFor('saved');
    expect(lastVisible).toBeDisabled();
    expect(screen.getAllByText('tracker.manageDialog.lastVisibleHint')).toHaveLength(1);

    fireEvent.click(lastVisible);
    expect(onToggle).not.toHaveBeenCalled();

    // Hidden stages stay togglable so the board is always recoverable.
    const hiddenSwitch = switchFor('applied');
    expect(hiddenSwitch).not.toBeDisabled();
    fireEvent.click(hiddenSwitch);
    expect(onToggle).toHaveBeenCalledWith('applied');
  });

  it('shows no lock hint while two stages are visible', () => {
    render(
      <ManageColumnsDialog
        open
        onOpenChange={vi.fn()}
        hiddenStatuses={new Set(ALL_BUT_SAVED.slice(1))}
        onToggle={vi.fn()}
      />
    );

    expect(screen.queryByText('tracker.manageDialog.lastVisibleHint')).not.toBeInTheDocument();
    expect(switchFor('saved')).not.toBeDisabled();
  });
});

describe('KanbanBoard column visibility', () => {
  const application: Application = {
    application_id: 'app-1',
    job_id: 'job-1',
    resume_id: 'res-1',
    master_resume_id: null,
    status: 'saved',
    company: 'ACME',
    role: 'Engineer',
    applied_at: null,
    notes: null,
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  function columnsFixture(): ApplicationColumns {
    const columns = APPLICATION_STATUS_ORDER.reduce((acc, status) => {
      acc[status] = [];
      return acc;
    }, {} as ApplicationColumns);
    columns.saved = [application];
    return columns;
  }

  async function renderBoard() {
    render(<KanbanBoard />);
    await waitFor(() => expect(visibleColumns().length).toBeGreaterThan(0));
  }

  beforeEach(() => {
    localStorage.clear();
    boardDialog.onToggle = null;
    vi.mocked(listApplications).mockResolvedValue({ columns: columnsFixture() });
  });

  it('does not write the stored selection back on mount', async () => {
    // Deliberately non-canonical order: a mount-time persist would rewrite it.
    const stored = JSON.stringify(['rejected', 'interview']);
    localStorage.setItem(TRACKER_HIDDEN_STATUSES_KEY, stored);

    await renderBoard();

    expect(localStorage.getItem(TRACKER_HIDDEN_STATUSES_KEY)).toBe(stored);
    expect(visibleColumns()).toEqual(
      APPLICATION_STATUS_ORDER.filter((s) => s !== 'rejected' && s !== 'interview')
    );
  });

  it('persists a stage the user actually hides', async () => {
    await renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'tracker.manage' }));
    fireEvent.click(switchFor('applied'));

    expect(localStorage.getItem(TRACKER_HIDDEN_STATUSES_KEY)).toBe(JSON.stringify(['applied']));
    expect(visibleColumns()).not.toContain('applied');

    // ...and un-hiding round-trips back to an empty selection.
    fireEvent.click(switchFor('applied'));
    expect(localStorage.getItem(TRACKER_HIDDEN_STATUSES_KEY)).toBe(JSON.stringify([]));
    expect(visibleColumns()).toContain('applied');
  });

  it('refuses to hide the last visible stage even when the dialog is bypassed', async () => {
    const stored = JSON.stringify(ALL_BUT_SAVED);
    localStorage.setItem(TRACKER_HIDDEN_STATUSES_KEY, stored);

    await renderBoard();
    expect(visibleColumns()).toEqual(['saved']);

    const toggle = boardDialog.onToggle;
    expect(toggle).toBeTypeOf('function');
    act(() => toggle?.('saved'));

    expect(visibleColumns()).toEqual(['saved']);
    expect(localStorage.getItem(TRACKER_HIDDEN_STATUSES_KEY)).toBe(stored);
  });
});
