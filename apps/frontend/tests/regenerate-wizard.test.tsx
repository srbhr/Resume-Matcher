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
});

describe('RegenerateDiffPreview', () => {
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
