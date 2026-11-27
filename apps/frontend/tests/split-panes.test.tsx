import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplitPanes } from '@/components/builder/split-panes';
// Loaded here first, so SplitPanes' dynamic import resolves from the module cache.
import '@/components/ui/resizable-split';

/**
 * The builder's editor and preview: a fixed grid at first and on small
 * screens; a draggable split on wide screens once ui-sdk's Resizable loads
 * after paint (it stays out of the builder's first-load JS).
 */

/** A matchMedia stand-in whose answer can change, telling its listeners. */
function screenIs(initiallyWide: boolean) {
  let wide = initiallyWide;
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return wide;
        },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }) as unknown as MediaQueryList
  );
  return (next: boolean) => {
    wide = next;
    act(() => listeners.forEach((listener) => listener()));
  };
}

/** Pane content with state of its own, the way the Writing panel holds a proposal. */
function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      {label} {count}
    </button>
  );
}

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
    // Let every pending effect and promise settle.
    await act(async () => {});

    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByText('Editor').closest('.grid')).toHaveClass(
      'grid-cols-1',
      'lg:grid-cols-2'
    );
    // Editor first, then preview, in the same grid.
    const grid = screen.getByText('Editor').closest('.grid') as HTMLElement;
    expect(grid).toContainElement(screen.getByText('Preview'));
    expect(grid.textContent).toBe('EditorPreview');
  });

  it('keeps each pane’s state when the window crosses the wide breakpoint, both ways', async () => {
    const setWide = screenIs(true);
    render(
      <SplitPanes
        left={<Counter label="Editor" />}
        right={<Counter label="Preview" />}
        handleLabel="Resize editor and preview"
      />
    );
    await screen.findByRole('separator');
    fireEvent.click(screen.getByRole('button', { name: 'Editor 0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview 0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview 1' }));

    setWide(false);
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByRole('button', { name: 'Editor 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview 2' })).toBeInTheDocument();

    setWide(true);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editor 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview 2' })).toBeInTheDocument();
  });

  it('keeps each pane’s state when the split arrives after the user has started', async () => {
    screenIs(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Hold the split's code back until the user has clicked.
    vi.doMock('@/components/ui/resizable-split', async () => {
      await gate;
      return vi.importActual('@/components/ui/resizable-split');
    });
    vi.resetModules();
    const { SplitPanes: FreshSplitPanes } = await import('@/components/builder/split-panes');
    render(
      <FreshSplitPanes
        left={<Counter label="Editor" />}
        right={<p>Preview</p>}
        handleLabel="Resize editor and preview"
      />
    );
    await act(async () => {});
    expect(screen.queryByRole('separator')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editor 0' }));

    release();
    await screen.findByRole('separator');
    expect(screen.getByRole('button', { name: 'Editor 1' })).toBeInTheDocument();
    vi.doUnmock('@/components/ui/resizable-split');
  });
});
