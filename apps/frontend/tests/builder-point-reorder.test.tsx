import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';
import { ExperienceForm } from '@/components/builder/forms/experience-form';
import { ProjectsForm } from '@/components/builder/forms/projects-form';
import { GenericItemForm } from '@/components/builder/forms/generic-item-form';

/**
 * Description points (bullets) inside an entry can be reordered.
 *
 * Each entry nests its own points DndContext inside the section's entry
 * DndContext, so the stub records every context by id rather than keeping only
 * the last one rendered. Drops are delivered straight to the handler a context
 * was given — jsdom has no layout for a real pointer drag.
 */

const contexts = new Map<string, (event: DragEndEvent) => void>();

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({
      id,
      onDragEnd,
      children,
    }: {
      id: string;
      onDragEnd: (event: DragEndEvent) => void;
      children: React.ReactNode;
    }) => {
      contexts.set(id, onDragEnd);
      return <>{children}</>;
    },
  };
});

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({ value }: { value: string }) => <div>{value}</div>,
}));

const dropOn = (activeId: number, overId: number | null) =>
  ({
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  }) as unknown as DragEndEvent;

const drop = (contextId: string, activeId: number, overId: number | null) => {
  const onDragEnd = contexts.get(contextId);
  expect(onDragEnd, `no DndContext rendered with id "${contextId}"`).toBeDefined();
  onDragEnd!(dropOn(activeId, overId));
};

afterEach(() => {
  contexts.clear();
});

describe('description point reordering', () => {
  const jobs = [
    {
      id: 1,
      title: 'Backend Developer',
      description: ['A', 'B', 'C'],
      descriptionStyles: ['bullet', 'bullet', 'plain'] as ('bullet' | 'plain')[],
    },
    { id: 2, title: 'Intern', description: ['X', 'Y'] },
  ];

  it('moves a point within its job and carries its style along', () => {
    const onChange = vi.fn();
    render(<ExperienceForm data={jobs} onChange={onChange} />);

    drop('experience-1-points', 2, 0); // drag 'C' (plain) to the top

    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0];
    expect(next[0]).toMatchObject({
      id: 1,
      title: 'Backend Developer',
      description: ['C', 'A', 'B'],
      descriptionStyles: ['plain', 'bullet', 'bullet'],
    });
    // The other job and the job order are untouched: a point drag is not an
    // entry drag.
    expect(next.map((j: { id: number }) => j.id)).toEqual([1, 2]);
    expect(next[1]).toBe(jobs[1]);
  });

  it('ignores a no-op point drop', () => {
    const onChange = vi.fn();
    render(<ExperienceForm data={jobs} onChange={onChange} />);

    drop('experience-1-points', 1, 1);
    drop('experience-1-points', 1, null);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('gives each entry its own points context, separate from the entry context', () => {
    render(<ExperienceForm data={jobs} onChange={vi.fn()} />);

    expect([...contexts.keys()].sort()).toEqual([
      'experience-1-points',
      'experience-2-points',
      'experience-items',
    ]);
  });

  it('labels point handles distinctly from entry handles', () => {
    render(<ExperienceForm data={jobs} onChange={vi.fn()} />);

    // 2 entries, 5 points across them. The i18n mock returns the key itself.
    expect(screen.getAllByRole('button', { name: 'Drag to reorder' })).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'builder.genericItemForm.actions.reorderPoint' })
    ).toHaveLength(5);
  });

  it('renders no points context for an entry without points', () => {
    render(
      <ExperienceForm data={[{ id: 1, title: 'Empty', description: [] }]} onChange={vi.fn()} />
    );

    expect(contexts.has('experience-1-points')).toBe(false);
  });

  it('reorders project points', () => {
    const onChange = vi.fn();
    render(
      <ProjectsForm
        data={[{ id: 7, name: 'YumiGo', description: ['A', 'B'] }]}
        onChange={onChange}
      />
    );

    drop('projects-7-points', 1, 0);

    expect(onChange.mock.calls[0][0][0].description).toEqual(['B', 'A']);
  });

  it('reorders custom-section points under a section-scoped id', () => {
    const onChange = vi.fn();
    render(
      <GenericItemForm
        sectionKey="publications"
        items={[{ id: 3, title: 'Paper', description: ['A', 'B'] }]}
        onChange={onChange}
      />
    );

    drop('custom-publications-3-points', 0, 1);

    expect(onChange.mock.calls[0][0][0].description).toEqual(['B', 'A']);
  });
});
