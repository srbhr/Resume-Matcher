import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SideTab, SideTabs, SideTabsList, SideTabsPanel } from '@/components/ui/side-tabs';

/**
 * ui-sdk's stylesheet makes every vertical tab list a column. The wrapper must
 * always say the direction itself, or a caller that wants a row on narrow
 * screens (Settings below xl) silently gets a tall stacked column.
 */
function Menu({ listClassName }: { listClassName?: string }) {
  return (
    <SideTabs value="a" onValueChange={vi.fn()}>
      <SideTabsList label="Sections" className={listClassName}>
        <SideTab value="a">Alpha</SideTab>
        <SideTab value="b">Beta</SideTab>
      </SideTabsList>
      <SideTabsPanel value="a">Panel A</SideTabsPanel>
      <SideTabsPanel value="b">Panel B</SideTabsPanel>
    </SideTabs>
  );
}

describe('SideTabs', () => {
  it('states a column by default, so the library stylesheet never decides', () => {
    render(<Menu />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toHaveClass('flex', 'flex-col');
  });

  it('lets a caller ask for a row below a breakpoint and a column above it', () => {
    render(<Menu listClassName="flex-row xl:flex-col" />);
    const list = screen.getByRole('tablist', { name: 'Sections' });
    expect(list).toHaveClass('flex-row', 'xl:flex-col');
    expect(list).not.toHaveClass('flex-col');
  });

  it('is vertical for the keyboard and shows the selected panel only', () => {
    const onValueChange = vi.fn();
    render(
      <SideTabs value="a" onValueChange={onValueChange}>
        <SideTabsList label="Sections">
          <SideTab value="a">Alpha</SideTab>
          <SideTab value="b">Beta</SideTab>
        </SideTabsList>
        <SideTabsPanel value="a">Panel A</SideTabsPanel>
        <SideTabsPanel value="b">Panel B</SideTabsPanel>
      </SideTabs>
    );
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel A');
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });
});
