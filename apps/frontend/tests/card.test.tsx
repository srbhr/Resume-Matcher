import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardTitle } from '@/components/ui/card';

describe('Card', () => {
  it('presses in on hover instead of lifting', () => {
    render(<Card variant="interactive" data-testid="c" />);
    const card = screen.getByTestId('c');
    expect(card).toHaveClass('hover:translate-x-px', 'hover:translate-y-px', 'hover:border-ink');
    expect(card.className).not.toMatch(/-translate-|transition-all|hover:shadow-sw/);
  });

  it('gives interactive cards a visible focus ring', () => {
    render(<Card variant="interactive" data-testid="c" />);
    expect(screen.getByTestId('c')).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-primary'
    );
  });

  it('offers a raised resting frame for cards on bare canvas', () => {
    render(<Card variant="raised" data-testid="c" />);
    expect(screen.getByTestId('c')).toHaveClass('bg-white', 'border', 'border-ink', 'shadow-sw-sm');
  });

  it('sets card titles in bold serif', () => {
    render(<CardTitle>Title</CardTitle>);
    expect(screen.getByText('Title')).toHaveClass('font-serif', 'font-bold');
  });
});
