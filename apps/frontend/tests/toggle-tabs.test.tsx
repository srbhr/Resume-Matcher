import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { RetroTabs } from '@/components/ui/retro-tabs';

describe('ToggleSwitch', () => {
  it('toggles when the row label is clicked', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onCheckedChange={onChange} label="Show photo" />);
    fireEvent.click(screen.getByText('Show photo'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('gives the card variant the nested (translucent) shadow, not a solid one', () => {
    const { container } = render(
      <ToggleSwitch checked={false} onCheckedChange={() => {}} label="Beta" />
    );
    expect(container.firstChild).toHaveClass('shadow-sw-nested');
    expect(container.firstChild).not.toHaveClass('shadow-sw-sm');
  });

  it('has an inline variant without the card frame', () => {
    const { container } = render(
      <ToggleSwitch variant="inline" checked onCheckedChange={vi.fn()} label="Inline" />
    );
    expect(container.firstChild).not.toHaveClass('shadow-sw-sm');
    expect(screen.getByRole('switch', { name: 'Inline' })).toHaveAttribute('aria-checked', 'true');
  });

  it('fills the track with ink when on and the panel tone when off', () => {
    const { rerender } = render(
      <ToggleSwitch checked onCheckedChange={vi.fn()} label="Show photo" />
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveClass('bg-ink');
    expect(toggle).not.toHaveClass('bg-primary');
    rerender(<ToggleSwitch checked={false} onCheckedChange={vi.fn()} label="Show photo" />);
    expect(screen.getByRole('switch')).toHaveClass('bg-panel');
    expect(screen.getByRole('switch')).not.toHaveClass('bg-ink');
  });
});

describe('RetroTabs', () => {
  const tabs = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
  ];

  it('exposes tab semantics with roving tabindex', () => {
    render(<RetroTabs tabs={tabs} activeTab="a" onTabChange={vi.fn()} idPrefix="t" />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    expect(alpha).toHaveAttribute('aria-selected', 'true');
    expect(alpha).toHaveAttribute('tabindex', '0');
    expect(alpha).toHaveAttribute('aria-controls', 't-panel-a');
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('tabindex', '-1');
  });

  it('activates the next tab with ArrowRight', () => {
    const onChange = vi.fn();
    render(<RetroTabs tabs={tabs} activeTab="a" onTabChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
