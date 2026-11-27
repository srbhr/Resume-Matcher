import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '@/components/ui/segmented-control';

function Harness() {
  const [value, setValue] = useState<'a4' | 'letter' | 'legal'>('a4');
  return (
    <SegmentedControl
      aria-label="Page size"
      value={value}
      onChange={setValue}
      items={[
        { value: 'a4', label: 'A4' },
        { value: 'letter', label: 'Letter' },
        { value: 'legal', label: 'Legal', disabled: true },
      ]}
    />
  );
}

describe('SegmentedControl', () => {
  it('is a radio group with the selected option in ink', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Page size' })).toBeInTheDocument();
    const a4 = screen.getByRole('radio', { name: 'A4' });
    expect(a4).toHaveAttribute('aria-checked', 'true');
    expect(a4).toHaveClass('bg-ink', 'text-white');
    expect(screen.getByRole('radio', { name: 'Letter' })).toHaveAttribute('tabindex', '-1');
  });

  it('draws tile options as single-bordered white tiles that leave the selection to their label', () => {
    render(
      <SegmentedControl
        aria-label="Template"
        variant="tile"
        value="a"
        onChange={() => {}}
        items={[
          { value: 'a', label: 'Single' },
          { value: 'b', label: 'Two column' },
        ]}
      />
    );
    const selected = screen.getByRole('radio', { name: 'Single' });
    expect(selected).toHaveAttribute('aria-checked', 'true');
    // One 1px border, no double outline and no fill: the label draws the selection band.
    expect(selected).toHaveClass('border', 'border-ink', 'bg-white', 'p-0');
    expect(selected).not.toHaveClass('outline-2', 'bg-ink');
    expect(screen.getByRole('radio', { name: 'Two column' })).toHaveClass('hover:bg-panel');
  });

  it('keeps the tab stop on an enabled option when the selected one is disabled', () => {
    render(
      <SegmentedControl
        aria-label="Page size"
        value="legal"
        onChange={() => {}}
        items={[
          { value: 'a4', label: 'A4' },
          { value: 'letter', label: 'Letter' },
          { value: 'legal', label: 'Legal', disabled: true },
        ]}
      />
    );
    expect(screen.getByRole('radio', { name: 'Legal' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: 'A4' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Letter' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves with arrow keys, skipping disabled options and wrapping', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A4' }), { key: 'ArrowRight' });
    const letter = screen.getByRole('radio', { name: 'Letter' });
    expect(letter).toHaveAttribute('aria-checked', 'true');
    expect(letter).toHaveFocus();
    fireEvent.keyDown(letter, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'A4' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('SegmentedControl groups', () => {
  it('captions runs of grouped options in one radiogroup, and the arrows cross groups', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Provider"
        value="a"
        onChange={onChange}
        items={[
          { value: 'a', label: 'A', group: 'Keys' },
          { value: 'b', label: 'B', group: 'Keys' },
          { value: 'c', label: 'C', group: 'Local' },
        ]}
      />
    );
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
    expect(screen.getByText('Keys')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.getByText('Local').nextElementSibling).toContainElement(
      screen.getByRole('radio', { name: 'C' })
    );

    fireEvent.keyDown(screen.getByRole('radio', { name: 'B' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('c');
  });

  it('keeps a caption that comes back in a later run as its own run, without a key clash', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <SegmentedControl
          aria-label="Provider"
          value="a"
          onChange={vi.fn()}
          items={[
            { value: 'a', label: 'A', group: 'Keys' },
            { value: 'b', label: 'B', group: 'Local' },
            { value: 'c', label: 'C', group: 'Keys' },
          ]}
        />
      );
      expect(screen.getAllByText('Keys')).toHaveLength(2);
      expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
    } finally {
      error.mockRestore();
    }
  });
});
