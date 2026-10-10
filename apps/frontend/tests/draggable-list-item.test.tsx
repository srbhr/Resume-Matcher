import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DraggableListItem } from '@/components/builder/draggable-list-item';

describe('DraggableListItem drag handle', () => {
  it('shows the house focus ring and a hit area wider than the 16px grip', () => {
    render(
      <DraggableListItem id={1} handleLabel="Drag entry">
        <p>row</p>
      </DraggableListItem>
    );

    // It is the keyboard route to reorder, so it needs a visible focus state.
    const handle = screen.getByLabelText('Drag entry');
    expect(handle).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-inset',
      'focus-visible:ring-primary'
    );
    // A pseudo-element grows the hit area past the 16px grip with no layout shift.
    expect(handle.className).toContain('before:-inset-x-1');
    expect(handle.className).toContain('before:inset-y-0');
  });
});
