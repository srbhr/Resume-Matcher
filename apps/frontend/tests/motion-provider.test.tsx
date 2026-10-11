import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MotionProvider } from '@/components/common/motion-provider';
import { DURATION, EASE_OUT_EXPO, SPRING } from '@/lib/motion';

describe('MotionProvider', () => {
  it('respects the OS reduced-motion setting', () => {
    render(
      <MotionProvider>
        <p>child</p>
      </MotionProvider>
    );
    expect(screen.getByText('child').parentElement).toHaveAttribute('data-reduced-motion', 'user');
  });

  it('uses the one curve, one spring and the duration tiers from the spec', () => {
    expect(EASE_OUT_EXPO).toEqual([0.16, 1, 0.3, 1]);
    expect(SPRING).toEqual({ type: 'spring', visualDuration: 0.2, bounce: 0 });
    expect(DURATION.surface).toBe(0.2);
    expect(DURATION.exit).toBeLessThan(DURATION.surface);
  });
});
