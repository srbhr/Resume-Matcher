import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationCard } from '@/components/tracker/application-card';
import type { Application } from '@/lib/api/tracker';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key, locale: 'en' }),
}));
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

const application = {
  application_id: 'a1',
  resume_id: 'r9',
  company: 'Acme',
  role: 'Engineer',
  applied_at: null,
} as Application;

function renderCard(props: {
  selected: boolean;
  selectionActive?: boolean;
  application?: Application;
}) {
  return render(
    <ApplicationCard
      application={props.application ?? application}
      selected={props.selected}
      selectionActive={props.selectionActive}
      onToggleSelect={vi.fn()}
      onOpen={vi.fn()}
    />
  );
}

describe('ApplicationCard', () => {
  it('marks selection with an ink ring so it never reads as blue focus or an action', () => {
    renderCard({ selected: true });
    const card = screen.getByRole('checkbox').closest('.ring-2');
    expect(card).not.toBeNull();
    expect(card).toHaveClass('ring-ink');
    expect(card).not.toHaveClass('ring-primary');
  });

  it('has no selection ring when unselected', () => {
    renderCard({ selected: false });
    expect(screen.getByRole('checkbox').closest('.ring-2')).toBeNull();
  });

  it('links to the resume that was sent, with its glyph at the 16px floor', () => {
    renderCard({ selected: false });
    const link = screen.getByRole('link', { name: 'tracker.card.viewResume' });
    expect(link).toHaveAttribute('href', '/resumes/r9');
    expect(link.querySelector('svg')).toHaveClass('size-4');
  });

  it('shows how long ago it was applied, with the exact date on hover', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    renderCard({ selected: false, application: { ...application, applied_at: tenDaysAgo } });
    // t is the identity mock, so the key shows; the date itself sits in the tooltip.
    const when = screen.getByText('tracker.card.appliedAgo');
    expect(when).toHaveAttribute('title', expect.stringMatching(/\d/));
  });

  it('lets the role run to two lines instead of cutting it at one', () => {
    renderCard({ selected: false });
    expect(screen.getByText('Engineer')).toHaveClass('line-clamp-2');
    expect(screen.getByText('Engineer')).not.toHaveClass('truncate');
  });

  it('hides the checkbox until hover or focus, and shows it everywhere once one is selected', () => {
    const { unmount } = renderCard({ selected: false });
    const idle = screen.getByRole('checkbox');
    expect(idle).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100'
    );
    unmount();

    renderCard({ selected: false, selectionActive: true });
    expect(screen.getByRole('checkbox')).not.toHaveClass('opacity-0');
  });
});
