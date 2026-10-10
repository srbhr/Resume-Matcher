import { render, screen } from '@testing-library/react';
import { useIsPresent } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FadeItem, FadePresence } from '@/components/common/presence';

describe('presence wrappers', () => {
  it('FadePresence renders its child only while shown, in a plain div', () => {
    const { rerender } = render(
      <FadePresence show className="box">
        <p>hello</p>
      </FadePresence>
    );
    expect(screen.getByText('hello').parentElement).toHaveClass('box');
    expect(screen.getByText('hello').parentElement).not.toHaveAttribute('initial');
    rerender(
      <FadePresence show={false} className="box">
        <p>hello</p>
      </FadePresence>
    );
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
  });

  it('FadeItem wraps a list item and keeps its className', () => {
    render(
      <FadeItem className="row">
        <span>item</span>
      </FadeItem>
    );
    expect(screen.getByText('item').parentElement).toHaveClass('row');
  });

  describe('while AnimatePresence keeps the subtree mounted to exit', () => {
    afterEach(() => {
      vi.mocked(useIsPresent).mockReturnValue(true);
    });

    // The exiting subtree keeps live handlers (a second click on an exiting row's Delete
    // would fire a stale handler and remove the next item), so the wrapper must be inert
    // and click-through.
    it('makes an exiting FadeItem inert and click-through', () => {
      vi.mocked(useIsPresent).mockReturnValue(false);
      render(
        <FadeItem className="row">
          <button type="button">remove</button>
        </FadeItem>
      );
      const wrapper = screen.getByRole('button', { name: 'remove' }).parentElement;
      expect(wrapper).toHaveClass('row');
      expect(wrapper).toHaveAttribute('inert');
      expect(wrapper).toHaveClass('pointer-events-none');
    });

    it('makes an exiting FadePresence inert and click-through', () => {
      vi.mocked(useIsPresent).mockReturnValue(false);
      render(
        <FadePresence show className="box">
          <button type="button">dismiss</button>
        </FadePresence>
      );
      const wrapper = screen.getByRole('button', { name: 'dismiss' }).parentElement;
      expect(wrapper).toHaveClass('box');
      expect(wrapper).toHaveAttribute('inert');
      expect(wrapper).toHaveClass('pointer-events-none');
    });

    it('keeps FadeItem and FadePresence interactive while present', () => {
      render(
        <>
          <FadeItem className="row">
            <button type="button">remove</button>
          </FadeItem>
          <FadePresence show className="box">
            <button type="button">dismiss</button>
          </FadePresence>
        </>
      );
      for (const [name, cls] of [
        ['remove', 'row'],
        ['dismiss', 'box'],
      ] as const) {
        const wrapper = screen.getByRole('button', { name }).parentElement;
        expect(wrapper).toHaveClass(cls);
        expect(wrapper).not.toHaveAttribute('inert');
        expect(wrapper).not.toHaveClass('pointer-events-none');
      }
    });
  });
});
