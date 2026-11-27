import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplitPanes } from '@/components/builder/split-panes';
// Loaded here first, so SplitPanes' dynamic import resolves from the module cache.
import '@/components/ui/resizable-split';

/**
 * The builder's editor and preview: a fixed grid at first and on small
 * screens; a draggable split on wide screens once ui-sdk's Resizable loads
 * after paint (it stays out of the builder's first-load JS).
 */

const screenIs = (wide: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: wide,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  );

const panes = (
  <SplitPanes left={<p>Editor</p>} right={<p>Preview</p>} handleLabel="Resize editor and preview" />
);

afterEach(() => vi.restoreAllMocks());

describe('builder split panes', () => {
  it('becomes a split with a named, draggable separator on a wide screen', async () => {
    screenIs(true);
    render(panes);

    const handle = await screen.findByRole('separator', { name: 'Resize editor and preview' });
    expect(handle).toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('keeps the stacked grid, with no separator, on a narrow screen', async () => {
    screenIs(false);
    render(panes);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByText('Editor').parentElement).toHaveClass('grid-cols-1', 'lg:grid-cols-2');
  });
});
