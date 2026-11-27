import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { RetroTabs } from '@/components/ui/retro-tabs';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

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

  it('spells its state out: the live half of Off | On is filled ink, never blue', () => {
    const { rerender } = render(
      <ToggleSwitch checked onCheckedChange={vi.fn()} label="Show photo" />
    );
    const toggle = screen.getByRole('switch', { name: 'Show photo' });
    const [off, on] = Array.from(toggle.children);
    expect(off).toHaveTextContent('common.off');
    expect(on).toHaveTextContent('common.on');
    expect(on).toHaveClass('bg-ink', 'text-white');
    expect(off).not.toHaveClass('bg-ink');
    expect(toggle.className).not.toContain('bg-primary');

    rerender(<ToggleSwitch checked={false} onCheckedChange={vi.fn()} label="Show photo" />);
    expect(off).toHaveClass('bg-ink', 'text-white');
    expect(on).not.toHaveClass('bg-ink');
  });

  it('labels the row in sentence case, not the mono uppercase face', () => {
    render(<ToggleSwitch checked onCheckedChange={vi.fn()} label="Compact mode" />);
    const label = screen.getByText('Compact mode');
    expect(label).toHaveClass('font-sans', 'text-sm');
    expect(label).not.toHaveClass('uppercase', 'font-mono');
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

  it('points only the selected tab at a panel, since inactive panels are not rendered', () => {
    render(<RetroTabs tabs={tabs} activeTab="b" onTabChange={vi.fn()} idPrefix="t" />);
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-controls', 't-panel-b');
    expect(screen.getByRole('tab', { name: 'Alpha' })).not.toHaveAttribute('aria-controls');
  });

  it('keeps the tab stop on an enabled tab when the active tab is disabled', () => {
    const withDisabledActive = [
      { id: 'a', label: 'Alpha', disabled: true },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ];
    render(<RetroTabs tabs={withDisabledActive} activeTab="a" onTabChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveAttribute('tabindex', '-1');
  });

  it('can be named by a label or by a heading', () => {
    const { rerender } = render(
      <RetroTabs tabs={tabs} activeTab="a" onTabChange={vi.fn()} aria-label="Preview" />
    );
    expect(screen.getByRole('tablist', { name: 'Preview' })).toBeInTheDocument();

    rerender(
      <>
        <h2 id="heading">Output</h2>
        <RetroTabs tabs={tabs} activeTab="a" onTabChange={vi.fn()} aria-labelledby="heading" />
      </>
    );
    expect(screen.getByRole('tablist', { name: 'Output' })).toBeInTheDocument();
  });

  it('activates the next tab with ArrowRight', () => {
    const onChange = vi.fn();
    render(<RetroTabs tabs={tabs} activeTab="a" onTabChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('RetroTabs groups', () => {
  it('sets a group that startsGroup apart in its own bar, in one tablist the arrows cross', () => {
    const onTabChange = vi.fn();
    render(
      <RetroTabs
        aria-label="Output"
        activeTab="doc"
        onTabChange={onTabChange}
        tabs={[
          { id: 'doc', label: 'Doc' },
          { id: 'check', label: 'Check', startsGroup: true },
        ]}
      />
    );
    const list = screen.getByRole('tablist', { name: 'Output' });
    const [docBar, checkBar] = Array.from(list.children);
    expect(list.children).toHaveLength(2);
    expect(docBar).toHaveClass('border', 'border-ink', 'bg-ink');
    expect(checkBar).toContainElement(screen.getByRole('tab', { name: 'Check' }));
    expect(list).toHaveClass('gap-2');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Doc' }), { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenLastCalledWith('check');
  });
});
