import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '@/components/tracker/kanban-board';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/lib/api/tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/tracker')>();
  const columns = Object.fromEntries(actual.APPLICATION_STATUS_ORDER.map((status) => [status, []]));
  return { ...actual, listApplications: vi.fn().mockResolvedValue({ columns }) };
});

describe('KanbanBoard header', () => {
  it('is a compact single-row toolbar: one short H1, an inline back link, a mono caption', async () => {
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

    const back = screen.getByRole('link', { name: 'nav.backToDashboard' });
    expect(back).toHaveAttribute('href', '/dashboard');
    expect(back).toHaveClass('border-ink', 'h-8');
    expect(back).not.toHaveClass('mb-8');

    expect(screen.getByText(/tracker\.subtitle/)).toHaveClass('font-mono', 'text-xs', 'text-steel');

    const band = title.closest('header');
    expect(band).toHaveClass('px-6', 'py-3', 'border-b', 'border-ink');
    expect(band).not.toHaveClass('p-8', 'md:p-12');
    expect(band).toContainElement(back);
    expect(band).toContainElement(screen.getByRole('button', { name: 'tracker.addApplication' }));
  });
});
