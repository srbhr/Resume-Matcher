import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

describe('form primitives', () => {
  it.each([
    ['Input', <Input key="i" aria-label="field" />],
    ['Textarea', <Textarea key="t" aria-label="field" />],
  ])('%s is a white elevated field that flags invalid input', (_name, el) => {
    render(el);
    const field = screen.getByLabelText('field');
    expect(field).toHaveClass(
      'bg-white',
      'border-ink',
      'aria-invalid:border-destructive',
      'focus-visible:border-primary'
    );
    expect(field.className).not.toContain('bg-transparent');
  });

  it('defaults labels to the mono caption every call site already used', () => {
    render(<Label>Email</Label>);
    expect(screen.getByText('Email')).toHaveClass(
      'font-mono',
      'text-xs',
      'uppercase',
      'tracking-wider',
      'text-steel'
    );
  });
});
