import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dropdown } from '@/components/ui/dropdown';

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
});
