import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManageTrackerStatusesDialog } from '@/components/tracker/manage-tracker-statuses-dialog';
import type { ApplicationStatus } from '@/lib/api/tracker';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

describe('ManageTrackerStatusesDialog', () => {
  it('renders one visibility switch for every tracker status', () => {
    render(
      <ManageTrackerStatusesDialog
        open
        onOpenChange={vi.fn()}
        hiddenStatuses={[]}
        onHiddenStatusesChange={vi.fn()}
      />
    );

    expect(screen.getAllByRole('switch')).toHaveLength(7);
    expect(screen.getByRole('switch', { name: 'tracker.columns.saved' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'tracker.columns.rejected' })).toBeChecked();
  });

  it('reports a visible status as hidden when its switch is turned off', () => {
    const onHiddenStatusesChange = vi.fn();
    render(
      <ManageTrackerStatusesDialog
        open
        onOpenChange={vi.fn()}
        hiddenStatuses={[]}
        onHiddenStatusesChange={onHiddenStatusesChange}
      />
    );

    fireEvent.click(screen.getByRole('switch', { name: 'tracker.columns.interview' }));

    expect(onHiddenStatusesChange).toHaveBeenCalledWith(['interview']);
  });

  it('allows the final visible status to be hidden', () => {
    const hiddenStatuses: ApplicationStatus[] = [
      'saved',
      'applied',
      'no_response',
      'response',
      'interview',
      'accepted',
    ];
    const onHiddenStatusesChange = vi.fn();
    render(
      <ManageTrackerStatusesDialog
        open
        onOpenChange={vi.fn()}
        hiddenStatuses={hiddenStatuses}
        onHiddenStatusesChange={onHiddenStatusesChange}
      />
    );

    fireEvent.click(screen.getByRole('switch', { name: 'tracker.columns.rejected' }));

    expect(onHiddenStatusesChange).toHaveBeenCalledWith([
      'saved',
      'applied',
      'no_response',
      'response',
      'interview',
      'accepted',
      'rejected',
    ]);
  });

  it('closes from the done action without changing status data', () => {
    const onOpenChange = vi.fn();
    const onHiddenStatusesChange = vi.fn();
    render(
      <ManageTrackerStatusesDialog
        open
        onOpenChange={onOpenChange}
        hiddenStatuses={['saved']}
        onHiddenStatusesChange={onHiddenStatusesChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'tracker.manage.done' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onHiddenStatusesChange).not.toHaveBeenCalled();
  });
});
