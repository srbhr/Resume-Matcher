import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '@/components/tracker/kanban-board';
import {
  APPLICATION_STATUS_ORDER,
  listApplications,
  type Application,
  type ApplicationColumns,
} from '@/lib/api/tracker';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/tracker',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/tracker')>();
  return { ...actual, listApplications: vi.fn() };
});

function columnsWith(cards: Application[]): ApplicationColumns {
  const columns = Object.fromEntries(
    APPLICATION_STATUS_ORDER.map((status) => [status, []])
  ) as unknown as ApplicationColumns;
  columns.saved = cards;
  return columns;
}

describe('KanbanBoard header', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('announces loading with a status region instead of a silent spinner', () => {
    vi.mocked(listApplications).mockReturnValue(new Promise(() => {}));
    render(<KanbanBoard />);
    expect(screen.getByRole('status')).toHaveTextContent('common.loading');
  });

  it('is a compact single-row toolbar: one short H1, an arrow-only back link, no caption', async () => {
    vi.mocked(listApplications).mockResolvedValue({ columns: columnsWith([]) });
    render(<KanbanBoard />);
    await screen.findByText('tracker.empty.title');

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    const title = headings[0];
    expect(title).toHaveTextContent('tracker.title');
    expect(title).toHaveClass(
      'font-serif',
      'text-2xl',
      'md:text-3xl',
      'font-bold',
      'uppercase',
      'leading-tight'
    );
    expect(title).not.toHaveClass('text-4xl', 'md:text-5xl');
    // A real minimum width, so the actions wrap before they squeeze the title.
    expect(title.parentElement).toHaveClass('min-w-[14rem]', 'flex-1');
    expect(title.parentElement).not.toHaveClass('min-w-0');

    const back = screen.getByRole('link', { name: 'nav.backToDashboard' });
    expect(back).toHaveAttribute('href', '/dashboard');
    expect(back).toHaveClass('border-ink', 'h-8', 'w-8');
    expect(back).not.toHaveClass('mb-8');
    // The arrow alone, named by its label and tooltip, as on every page.
    expect(back).toHaveTextContent('');
    expect(back).toHaveAttribute('title', 'nav.backToDashboard');
    // No "// subtitle" caption beside the title.
    expect(title.parentElement?.querySelector('p')).toBeNull();

    const band = title.closest('header');
    expect(band).toHaveClass('px-6', 'py-3', 'border-b', 'border-ink');
    expect(band).not.toHaveClass('p-8', 'md:p-12');
    expect(band).toContainElement(back);

    // Every control in the band is h-8, so the band height never changes.
    const manage = screen.getByRole('button', { name: 'tracker.manage' });
    const add = screen.getByRole('button', { name: 'tracker.addApplication' });
    expect(band).toContainElement(add);
    expect(manage).toHaveClass('h-8');
    expect(add).toHaveClass('h-8');
    // Actions stay right-aligned when they wrap onto their own row.
    expect(add.parentElement).toHaveClass('ml-auto');
  });

  const card = { application_id: 'a1', company: 'Acme', role: 'Engineer' } as Application;

  it('shows no stage rail or scroll buttons when every stage fits', async () => {
    vi.mocked(listApplications).mockResolvedValue({ columns: columnsWith([card]) });

    render(<KanbanBoard />);
    await screen.findByText('Acme');

    expect(screen.queryByRole('navigation', { name: 'tracker.scroll.rail' })).toBeNull();
    expect(screen.queryByRole('button', { name: /scroll/i })).toBeNull();
  });

  it('offers one way across when stages overflow: the stage rail, with counts', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(2000);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
    vi.mocked(listApplications).mockResolvedValue({ columns: columnsWith([card]) });

    render(<KanbanBoard />);

    const rail = await screen.findByRole('navigation', { name: 'tracker.scroll.rail' });
    expect(within(rail).getAllByRole('button')).toHaveLength(APPLICATION_STATUS_ORDER.length);
    expect(within(rail).getByRole('button', { name: /tracker\.columns\.saved/ })).toHaveTextContent(
      '1'
    );
    expect(screen.queryByRole('button', { name: /scroll/i })).toBeNull();
  });

  it('lays the stages out as a grid that shares the width, 12rem each at the least', async () => {
    vi.mocked(listApplications).mockResolvedValue({ columns: columnsWith([card]) });

    const { container } = render(<KanbanBoard />);
    await screen.findByText('Acme');

    const board = container.querySelector('[data-column="saved"]')?.parentElement as HTMLElement;
    expect(board).toHaveClass('grid', 'overflow-x-auto');
    expect(board.style.gridTemplateColumns).toBe(
      `repeat(${APPLICATION_STATUS_ORDER.length}, minmax(12rem, 1fr))`
    );
  });

  it('marks the outcome stages: Accepted green, Rejected red, the rest ink', async () => {
    vi.mocked(listApplications).mockResolvedValue({ columns: columnsWith([card]) });

    render(<KanbanBoard />);
    await screen.findByText('Acme');
    const square = (stage: string) =>
      screen.getByRole('heading', { name: `tracker.columns.${stage}` }).previousElementSibling;

    expect(square('accepted')).toHaveClass('bg-success');
    expect(square('rejected')).toHaveClass('bg-destructive');
    expect(square('applied')).toHaveClass('bg-ink');
  });
});
