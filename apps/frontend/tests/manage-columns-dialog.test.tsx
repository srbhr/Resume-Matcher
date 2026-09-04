import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ManageColumnsDialog } from '@/components/tracker/manage-columns-dialog';
import type { TrackerColumn } from '@/lib/api/tracker';

const trackerMocks = vi.hoisted(() => ({
  createTrackerColumn: vi.fn(),
}));

vi.mock('@/lib/api/tracker', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/tracker')>('@/lib/api/tracker');
  return { ...actual, ...trackerMocks };
});

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

const column = (id: string, label: string, position: number, isSystem = false): TrackerColumn => ({
  column_id: id,
  label,
  position,
  is_system: isSystem,
  is_hidden: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('ManageColumnsDialog', () => {
  it('renders custom columns and allows creating one', async () => {
    trackerMocks.createTrackerColumn.mockResolvedValue(column('custom_2', 'Offer', 2));
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageColumnsDialog
        open
        onOpenChange={vi.fn()}
        columns={[column('saved', 'Saved', 0, true), column('custom_1', 'Phone screen', 1)]}
        onToggle={vi.fn().mockResolvedValue(undefined)}
        onChanged={onChanged}
      />
    );
    expect(screen.getByDisplayValue('Phone screen')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('tracker.manageDialog.newColumnPlaceholder'), {
      target: { value: 'Offer' },
    });
    fireEvent.click(screen.getByText('tracker.manageDialog.add'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('reports visibility changes and disables hiding the last visible column', () => {
    render(
      <ManageColumnsDialog
        open
        onOpenChange={vi.fn()}
        columns={[column('saved', 'Saved', 0, true)]}
        onToggle={vi.fn().mockResolvedValue(undefined)}
        onChanged={vi.fn().mockResolvedValue(undefined)}
      />
    );
    const hide = screen.getByText('tracker.manageDialog.hide');
    expect(hide).toBeDisabled();
  });
});
