import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
