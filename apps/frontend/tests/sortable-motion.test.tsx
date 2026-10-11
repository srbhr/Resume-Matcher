import { render } from '@testing-library/react';
import { useReducedMotion } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationCard } from '@/components/tracker/application-card';
import { DraggableListItem } from '@/components/builder/draggable-list-item';
import { DraggableSectionWrapper } from '@/components/builder/draggable-section-wrapper';
import type { Application } from '@/lib/api/tracker';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

const sortable = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>> }));
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: (options: Record<string, unknown>) => {
    sortable.options.push(options);
    return {
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    };
  },
}));

const application = {
  application_id: 'a1',
  company: 'Acme',
  role: 'Engineer',
  applied_at: null,
} as Application;

const renderers: Record<string, () => void> = {
  'tracker card': () =>
    render(
      <ApplicationCard
        application={application}
        selected={false}
        sharedResume={false}
        onToggleSelect={vi.fn()}
        onOpen={vi.fn()}
      />
    ),
  'builder list item': () =>
    render(
      <DraggableListItem id={1}>
        <p>row</p>
      </DraggableListItem>
    ),
  'builder section': () =>
    render(
      <DraggableSectionWrapper id="s1">
        <p>section</p>
      </DraggableSectionWrapper>
    ),
};

describe.each(Object.entries(renderers))('%s drag timing', (_name, renderIt) => {
  afterEach(() => {
    sortable.options.length = 0;
    vi.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('settles neighbours in 200ms on the expo curve', () => {
    renderIt();
    expect(sortable.options.at(-1)?.transition).toEqual({
      duration: 200,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    });
  });

  it('drops the settle animation when the OS asks for reduced motion', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    renderIt();
    expect(sortable.options.at(-1)?.transition).toBeNull();
  });
});
