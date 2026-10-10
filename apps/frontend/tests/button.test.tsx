import Link from 'next/link';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonClass, type ButtonSize, type ButtonVariant } from '@/components/ui/button';

const VARIANTS: ButtonVariant[] = [
  'default',
  'destructive',
  'outline-destructive',
  'success',
  'warning',
  'outline',
  'secondary',
  'ghost',
  'link',
];
const SIZES: ButtonSize[] = ['default', 'sm', 'lg', 'icon', 'icon-sm', 'icon-xs'];

describe('Button', () => {
  it('gives warning buttons ink text (white on orange is 2.8:1)', () => {
    expect(buttonClass({ variant: 'warning' })).toContain('text-ink');
    expect(buttonClass({ variant: 'warning' })).not.toContain('text-white');
  });

  it('styles a link exactly like a button', () => {
    render(
      <Link href="/dashboard" className={buttonClass({ variant: 'outline', size: 'sm' })}>
        Back
      </Link>
    );
    expect(screen.getByRole('link', { name: 'Back' })).toHaveClass(
      'border-ink',
      'h-8',
      'shadow-sw-sm',
      'rounded-none'
    );
  });

  it('has compact icon sizes with an expanded hit area', () => {
    render(<Button size="icon-sm" aria-label="Edit" />);
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveClass(
      'h-8',
      'w-8',
      'before:-inset-1.5'
    );
  });

  it('offers an outline-destructive variant', () => {
    expect(buttonClass({ variant: 'outline-destructive' })).toContain('text-destructive');
    expect(buttonClass({ variant: 'outline-destructive' })).toContain('border-destructive');
  });

  it('keeps disabled buttons inert', () => {
    expect(buttonClass()).toContain('disabled:pointer-events-none');
  });

  it('uses one focus ring with a canvas offset', () => {
    expect(buttonClass()).toContain('focus-visible:ring-offset-canvas');
  });

  it('never uses raw palette shades, hex, or eased durations', () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        expect(buttonClass({ variant, size })).not.toMatch(
          /-(?:blue|red|green|orange|gray)-\d|\[#|duration-|ease-out\b/
        );
      }
    }
  });
});
