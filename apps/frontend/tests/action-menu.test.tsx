import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from '@/components/ui/action-menu';

describe('ActionMenu', () => {
  it('opens from its labelled trigger and runs the chosen action', async () => {
    const onAction = vi.fn();
    render(
      <ActionMenu
        label="More actions"
        items={[
          { value: 'duplicate', label: 'Duplicate' },
          { value: 'delete', label: 'Delete', destructive: true },
        ]}
        onAction={onAction}
      >
        <span aria-hidden="true">…</span>
      </ActionMenu>
    );
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();

    fireEvent.click(trigger);
    const del = await screen.findByRole('menuitem', { name: 'Delete' });
    expect(del).toHaveClass('text-destructive');
    fireEvent.click(del);

    expect(onAction).toHaveBeenCalledWith('delete');
  });
});
