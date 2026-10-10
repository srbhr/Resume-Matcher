import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BulkActionBar } from '@/components/tracker/bulk-action-bar';
import { APPLICATION_STATUS_ORDER } from '@/lib/api/tracker';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

function renderBar() {
  const props = { onMove: vi.fn(), onDelete: vi.fn(), onClear: vi.fn() };
  render(<BulkActionBar selectedCount={2} {...props} />);
  return props;
}

describe('BulkActionBar', () => {
  it('shows "Move to" as a placeholder that is never a selected option', () => {
    const { onMove } = renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'tracker.bulk.moveTo' }));
    const options = screen.getAllByRole('option');
    expect(options.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(0);
    // Only real stages are offered: no blank "Move to" row to pick.
    expect(options).toHaveLength(APPLICATION_STATUS_ORDER.length);

    fireEvent.click(screen.getByRole('option', { name: 'tracker.columns.interview' }));
    expect(onMove).toHaveBeenCalledWith('interview');
  });

  it('confirms the delete with the danger button', () => {
    const { onDelete } = renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'common.delete',
    });
    expect(confirm).toHaveClass('bg-destructive');

    fireEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
