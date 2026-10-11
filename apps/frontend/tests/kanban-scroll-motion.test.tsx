import { fireEvent, render, screen } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '@/components/tracker/kanban-board';
import { APPLICATION_STATUS_ORDER, type Application } from '@/lib/api/tracker';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/lib/api/tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/tracker')>();
  const card = { application_id: 'a1', company: 'Acme', role: 'Engineer' } as Application;
  const columns = Object.fromEntries(
    actual.APPLICATION_STATUS_ORDER.map((status, i) => [status, i === 0 ? [card] : []])
  );
  return { ...actual, listApplications: vi.fn().mockResolvedValue({ columns }) };
});

describe('KanbanBoard stage jump', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    scrollIntoView.mockClear();
    vi.mocked(useReducedMotion).mockReturnValue(false);
  });

  const jump = async () => {
    render(<KanbanBoard />);
    const stage = await screen.findByRole('button', {
      name: new RegExp(`tracker.columns.${APPLICATION_STATUS_ORDER[1]}`),
    });
    fireEvent.click(stage);
  };

  it('scrolls smoothly by default', async () => {
    await jump();
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('jumps instantly under reduced motion', async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    await jump();
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });
});
