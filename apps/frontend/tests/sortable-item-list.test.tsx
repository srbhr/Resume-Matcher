import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableItemList } from '@/components/builder/sortable-item-list';
import { ProjectsForm } from '@/components/builder/forms/projects-form';

/**
 * Wiring test for the drag-end path: DndContext#onDragEnd -> reorderById ->
 * onReorder.
 *
 * `reorder-items.test.ts` covers the reorder rules and
 * `builder-item-reorder.test.tsx` covers handle presence, but neither would
 * catch the plumbing between them breaking — a wrong `items` prop, an
 * `onReorder` that is never called, or a no-op guard that swallows real drags
 * would leave both suites green while reordering silently stopped working.
 *
 * A real pointer drag needs layout boxes that jsdom does not produce, so the
 * drag end is delivered straight to the handler DndContext was given. That is
 * the same payload @dnd-kit dispatches on drop.
 */

let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined;

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: DragEndEvent) => void;
    }) => {
      capturedOnDragEnd = onDragEnd;
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

/** Minimal stand-in for the drag-end payload @dnd-kit emits on drop. */
const dropOn = (activeId: number, overId: number | null) =>
  ({
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  }) as unknown as DragEndEvent;

afterEach(() => {
  capturedOnDragEnd = undefined;
});

describe('SortableItemList drag-end wiring', () => {
  const rows = [
    { id: 1, label: 'first' },
    { id: 2, label: 'second' },
    { id: 3, label: 'third' },
  ];

  const renderList = (onReorder: (items: typeof rows) => void) =>
    render(
      <SortableItemList id="test-items" items={rows} onReorder={onReorder}>
        {(item) => <div>{item.label}</div>}
      </SortableItemList>
    );

  it('reports the reordered list when an item is dropped on another', () => {
    const onReorder = vi.fn();
    renderList(onReorder);

    capturedOnDragEnd?.(dropOn(1, 3));

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0].map((i: (typeof rows)[number]) => i.id)).toEqual([2, 3, 1]);
  });

  it('does not report anything when the drag is a no-op', () => {
    const onReorder = vi.fn();
    renderList(onReorder);

    capturedOnDragEnd?.(dropOn(2, 2)); // dropped on itself
    capturedOnDragEnd?.(dropOn(2, null)); // dropped outside any target
    capturedOnDragEnd?.(dropOn(99, 1)); // id no longer in the list

    // An aborted drag must not dirty the resume or trigger an autosave.
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('renders the children it is given for every item', () => {
    renderList(vi.fn());

    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('third')).toBeInTheDocument();
  });
});

describe('ProjectsForm drag-end wiring', () => {
  it('passes the reordered projects up through onChange', () => {
    const onChange = vi.fn();
    render(
      <ProjectsForm
        data={[
          { id: 1, name: 'YumiGo', description: [] },
          { id: 2, name: 'Hireo AI', description: [] },
          { id: 3, name: 'TavernHub', description: [] },
        ]}
        onChange={onChange}
      />
    );

    // Drag the last project to the top — the reorder this PR enables.
    capturedOnDragEnd?.(dropOn(3, 1));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((p: { name?: string }) => p.name)).toEqual([
      'TavernHub',
      'YumiGo',
      'Hireo AI',
    ]);
  });
});
