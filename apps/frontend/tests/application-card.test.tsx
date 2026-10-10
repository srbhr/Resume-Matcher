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
  company: 'Acme',
  role: 'Engineer',
  applied_at: null,
} as Application;

function renderCard(props: { selected: boolean; sharedResume?: boolean }) {
  return render(
    <ApplicationCard
      application={application}
      selected={props.selected}
      sharedResume={props.sharedResume ?? false}
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

  it('keeps the shared-resume glyph at the 16px floor', () => {
    renderCard({ selected: false, sharedResume: true });
    const badge = screen.getByText('tracker.card.sharedResume');
    expect(badge.querySelector('svg')).toHaveClass('size-4');
    expect(badge.querySelector('svg')).not.toHaveClass('size-3');
  });
});
