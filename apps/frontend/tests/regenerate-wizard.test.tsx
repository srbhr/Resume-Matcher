import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RegenerateDialog } from '@/components/builder/regenerate-dialog';
import { RegenerateDiffPreview } from '@/components/builder/regenerate-diff-preview';
import type { RegenerateItemInput, RegeneratedItem } from '@/lib/api/enrichment';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => {
      if (key === 'builder.regenerate.selectDialog.itemCount.one') {
        return '{count} item';
      }
      if (key === 'builder.regenerate.selectDialog.itemCount.other') {
        return '{count} items';
      }
      return key;
    },
  }),
}));

describe('RegenerateDialog', () => {
  it('renders a dedicated empty-state message when there are no items', () => {
    render(
      <RegenerateDialog
        open
        onOpenChange={vi.fn()}
        experienceItems={[]}
        projectItems={[]}
        skillsItem={null}
        selectedItems={[]}
        onSelectionChange={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(
      screen.getByText('builder.regenerate.selectDialog.noItemsAvailable')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'builder.regenerate.selectDialog.continueButton' })
    ).toBeDisabled();
  });

  it('uses i18n pluralization keys for content counts', () => {
    const experienceItems: RegenerateItemInput[] = [
      {
        item_id: 'exp_0',
        item_type: 'experience',
        title: 'Senior Software Engineer',
        subtitle: 'Google',
        current_content: ['Did thing'],
      },
      {
        item_id: 'exp_1',
        item_type: 'experience',
        title: 'Staff Engineer',
        subtitle: 'Acme',
        current_content: ['Did A', 'Did B'],
      },
    ];

    render(
      <RegenerateDialog
        open
        onOpenChange={vi.fn()}
        experienceItems={experienceItems}
        projectItems={[]}
        skillsItem={null}
        selectedItems={[]}
        onSelectionChange={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('enables Continue after selecting an item', () => {
    const experienceItems: RegenerateItemInput[] = [
      {
        item_id: 'exp_0',
        item_type: 'experience',
        title: 'Senior Software Engineer',
        subtitle: 'Google',
        current_content: ['Did thing'],
      },
    ];

    const onContinue = vi.fn();

    const Wrapper = () => {
      const [selectedItems, setSelectedItems] = React.useState<RegenerateItemInput[]>([]);
      return (
        <RegenerateDialog
          open
          onOpenChange={vi.fn()}
          experienceItems={experienceItems}
          projectItems={[]}
          skillsItem={null}
          selectedItems={selectedItems}
          onSelectionChange={setSelectedItems}
          onContinue={onContinue}
        />
      );
    };

    render(<Wrapper />);

    const continueButton = screen.getByRole('button', {
      name: 'builder.regenerate.selectDialog.continueButton',
    });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Senior Software Engineer/i }));
    expect(continueButton).toBeEnabled();
  });

  it('marks a selected row with ink, not blue (selection is ink, blue is action)', () => {
    const experienceItems: RegenerateItemInput[] = [
      {
        item_id: 'exp_0',
        item_type: 'experience',
        title: 'Senior Software Engineer',
        subtitle: 'Google',
        current_content: ['Did thing'],
      },
    ];

    const Wrapper = () => {
      const [selectedItems, setSelectedItems] = React.useState<RegenerateItemInput[]>([]);
      return (
        <RegenerateDialog
          open
          onOpenChange={vi.fn()}
          experienceItems={experienceItems}
          projectItems={[]}
          skillsItem={null}
          selectedItems={selectedItems}
          onSelectionChange={setSelectedItems}
          onContinue={vi.fn()}
        />
      );
    };

    render(<Wrapper />);

    const row = screen.getByRole('button', { name: /Senior Software Engineer/i });
    const box = row.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(row).toHaveAttribute('aria-pressed', 'false');
    expect(box).toHaveClass('size-6', 'border', 'border-ink', 'bg-white');

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveClass('bg-panel');
    expect(row).not.toHaveClass('bg-info-tint');
    expect(box).toHaveClass('border-ink', 'bg-ink');
    expect(box).not.toHaveClass('bg-primary', 'border-primary');
    // 16px check glyph: nothing below the icon floor.
    expect(box.querySelector('svg')).toHaveClass('size-4', 'text-white');
  });
});

it('offers refresh retry after saved changes and prevents rejecting an applied result', () => {
  render(
    <RegenerateDiffPreview
      open
      onOpenChange={vi.fn()}
      regeneratedItems={[]}
      error="Refresh failed"
      onAccept={vi.fn()}
      onReject={vi.fn()}
      isApplying={false}
      needsRefresh
    />
  );
  expect(screen.getByText('builder.regenerate.errors.refreshFailed')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'builder.regenerate.diffPreview.retryRefresh' })
  ).toBeEnabled();
  expect(
    screen.getByRole('button', { name: 'builder.regenerate.diffPreview.rejectButton' })
  ).toBeDisabled();
});

describe('RegenerateDiffPreview', () => {
  it('pins apply errors and partial failures outside the scrolling body', () => {
    render(
      <RegenerateDiffPreview
        open
        onOpenChange={vi.fn()}
        regeneratedItems={[]}
        regenerateErrors={[
          { item_id: 'exp_1', item_type: 'experience', title: 'Staff Engineer', message: 'x' },
        ]}
        error="Failed to fetch"
        onAccept={vi.fn()}
        onReject={vi.fn()}
        isApplying={false}
      />
    );

    const applyError = screen.getByText('builder.regenerate.errors.networkError');
    const partial = screen.getByText('builder.regenerate.diffPreview.partialFailures');
    expect(applyError.closest('.overflow-y-auto')).toBeNull();
    expect(partial.closest('.overflow-y-auto')).toBeNull();
    expect(
      screen.getByText('builder.regenerate.diffPreview.changesCount').closest('.overflow-y-auto')
    ).not.toBeNull();
  });

  it('draws the changes-count check at the 16px icon floor', () => {
    render(
      <RegenerateDiffPreview
        open
        onOpenChange={vi.fn()}
        regeneratedItems={[]}
        error={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        isApplying={false}
      />
    );

    const chip = screen.getByText('builder.regenerate.diffPreview.changesCount');
    expect(chip.querySelector('svg')).toHaveClass('size-4');
    expect(chip.querySelector('svg')).not.toHaveClass('size-3');
  });

  it('shows human-friendly titles instead of technical IDs', () => {
    const regeneratedItems: RegeneratedItem[] = [
      {
        item_id: 'exp_0',
        item_type: 'experience',
        title: 'Senior Software Engineer',
        subtitle: 'Google',
        original_content: ['Old bullet'],
        new_content: ['New bullet'],
        diff_summary: 'Summary',
      },
    ];

    const { container } = render(
      <RegenerateDiffPreview
        open
        onOpenChange={vi.fn()}
        regeneratedItems={regeneratedItems}
        error={null}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        isApplying={false}
      />
    );

    expect(screen.getByText('Senior Software Engineer | Google')).toBeInTheDocument();
    expect(screen.queryByText('exp_0')).not.toBeInTheDocument();

    // Swiss style: avoid left-border-only diff indicators.
    expect(container.querySelector('.border-l-4')).toBeNull();
  });
});
