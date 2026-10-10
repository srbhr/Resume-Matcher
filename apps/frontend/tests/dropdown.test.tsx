import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dropdown } from '@/components/ui/dropdown';
import { Dialog, DialogContent } from '@/components/ui/dialog';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

const OPTIONS = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

function Harness({ initial = 'a', placeholder }: { initial?: string; placeholder?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Dropdown
      label="Stage"
      options={OPTIONS}
      value={value}
      onChange={setValue}
      placeholder={placeholder}
    />
  );
}

describe('Dropdown', () => {
  it('announces the label and the current value on the trigger', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Stage Alpha' })).toHaveAttribute(
      'aria-haspopup',
      'listbox'
    );
  });

  it('shows the placeholder and selects nothing when the value matches no option', () => {
    render(<Harness initial="" placeholder="Move to…" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stage Move to…' }));
    const selected = screen
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(0);
  });

  it('opens with ArrowDown, moves with arrows, and returns focus after a choice', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Stage Alpha' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveFocus();
    fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveFocus();
    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stage Beta' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Stage Alpha' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('marks the selected option without the success colour or a glyph', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Stage Alpha' }));
    const alpha = screen.getByRole('option', { name: 'Alpha' });
    expect(alpha).toHaveAttribute('aria-selected', 'true');
    expect(alpha).toHaveClass('bg-panel');
    expect(alpha.textContent).not.toContain('✓');
  });

  it('keeps Escape inside the listbox when the dropdown sits in a dialog', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <Harness />
        </DialogContent>
      </Dialog>
    );
    const trigger = screen.getByRole('button', { name: 'Stage Alpha' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('renders option descriptions in ink-soft so they stay AA on the panel fill', () => {
    render(
      <Dropdown
        label="Stage"
        options={[{ id: 'a', label: 'Alpha', description: 'First stage' }]}
        value="a"
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Stage/ }));
    const description = screen.getByText('First stage');
    expect(description).toHaveClass('text-ink-soft');
    expect(description).not.toHaveClass('text-steel');
  });

  describe('placement', () => {
    const rect = (top: number, bottom: number) =>
      ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top }) as DOMRect;

    function openInScroller(triggerRect: DOMRect, scrollerRect: DOMRect) {
      render(
        <div data-testid="scroller" style={{ overflowY: 'auto' }}>
          <Harness />
        </div>
      );
      const trigger = screen.getByRole('button', { name: 'Stage Alpha' });
      vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(triggerRect);
      vi.spyOn(screen.getByTestId('scroller'), 'getBoundingClientRect').mockReturnValue(
        scrollerRect
      );
      fireEvent.click(trigger);
      return screen.getByRole('listbox');
    }

    it('opens downward by default (no layout, zero rects)', () => {
      render(<Harness />);
      fireEvent.click(screen.getByRole('button', { name: 'Stage Alpha' }));
      const listbox = screen.getByRole('listbox');
      expect(listbox).toHaveClass('top-full', 'mt-1');
      expect(listbox).not.toHaveClass('bottom-full');
    });

    it('flips up when the trigger sits near the bottom of its scroll container', () => {
      const listbox = openInScroller(rect(380, 420), rect(0, 450));
      expect(listbox).toHaveClass('bottom-full', 'mb-1');
      expect(listbox).not.toHaveClass('top-full');
    });

    it('stays down when the scroll container leaves room for the menu', () => {
      const listbox = openInScroller(rect(40, 80), rect(0, 600));
      expect(listbox).toHaveClass('top-full');
      expect(listbox).not.toHaveClass('bottom-full');
    });

    it('stays down when there is even less room above than below', () => {
      const listbox = openInScroller(rect(20, 60), rect(0, 200));
      expect(listbox).toHaveClass('top-full');
    });
  });
});
