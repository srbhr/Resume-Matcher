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

  it('keeps the outline variant selection outline when the selected item has keyboard focus', () => {
    render(
      <SegmentedControl
        aria-label="Template"
        variant="outline"
        value="a"
        onChange={() => {}}
        items={[
          { value: 'a', label: 'Single' },
          { value: 'b', label: 'Two column' },
        ]}
      />
    );
    const selected = screen.getByRole('radio', { name: 'Single' });
    expect(selected).toHaveClass('outline-2', 'outline-ink');
    // focus-visible:outline-none would set outline-style: none and erase the selection outline.
    expect(selected).not.toHaveClass('focus-visible:outline-none');
    // The focus ring moves out past the 2px outline so both stay visible.
    expect(selected).toHaveClass('focus-visible:ring-offset-4');
    expect(screen.getByRole('radio', { name: 'Two column' })).toHaveClass(
      'focus-visible:outline-none'
    );
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
