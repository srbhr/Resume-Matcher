import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
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

/** Holds its own selection, as a page does. */
function StatefulMenu({ verticalFrom }: { verticalFrom?: string }) {
  const [value, setValue] = useState<'a' | 'b'>('a');
  return (
    <SideTabs value={value} onValueChange={setValue} verticalFrom={verticalFrom}>
      <SideTabsList label="Sections">
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

  it('moves between tabs with Up and Down Arrow and shows the selected panel only', () => {
    render(<StatefulMenu />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel A');

    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    alpha.focus();
    fireEvent.keyDown(alpha, { key: 'ArrowDown' });
    const beta = screen.getByRole('tab', { name: 'Beta' });
    expect(beta).toHaveFocus();
    fireEvent.click(beta);

    expect(beta).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel B');
    expect(screen.queryByText('Panel A')).toBeNull();
  });

  it('is horizontal below its `verticalFrom` breakpoint: Left and Right Arrow move', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
    try {
      render(<StatefulMenu verticalFrom="(min-width: 1280px)" />);
      // Horizontal is the tablist default, so no aria-orientation means horizontal.
      expect(screen.getByRole('tablist')).not.toHaveAttribute('aria-orientation', 'vertical');
      const alpha = screen.getByRole('tab', { name: 'Alpha' });
      alpha.focus();
      fireEvent.keyDown(alpha, { key: 'ArrowRight' });
      expect(screen.getByRole('tab', { name: 'Beta' })).toHaveFocus();
    } finally {
      matchMedia.mockRestore();
    }
  });

  it('is vertical from its `verticalFrom` breakpoint up', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
    try {
      render(<StatefulMenu verticalFrom="(min-width: 1280px)" />);
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    } finally {
      matchMedia.mockRestore();
    }
  });
});
