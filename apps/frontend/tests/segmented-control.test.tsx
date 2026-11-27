import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
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
