import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from '@/components/ui/alert';
import { StatusIndicator } from '@/components/ui/status-indicator';

describe('Alert', () => {
  it.each([
    ['error', 'alert', 'border-destructive', 'bg-destructive-tint'],
    ['warning', 'alert', 'border-warning', 'bg-warning-tint'],
    ['success', 'status', 'border-success', 'bg-success-tint'],
    ['info', 'status', 'border-primary', 'bg-info-tint'],
  ] as const)('%s uses role=%s and its tone colours', (tone, role, border, bg) => {
    render(
      <Alert tone={tone} title="Heads up">
        Body
      </Alert>
    );
    const alert = screen.getByRole(role);
    expect(alert).toHaveClass('border-2', border, bg, 'rounded-none');
    expect(alert.className).not.toMatch(/shadow/);
  });

  it('labels warnings in the AA warning-text colour, not the fill', () => {
    render(<Alert tone="warning" title="Setup required" />);
    expect(screen.getByText('Setup required')).toHaveClass(
      'text-warning-text',
      'font-mono',
      'uppercase'
    );
  });
});

describe('StatusIndicator', () => {
  it('always renders the text label next to a 12px square', () => {
    render(<StatusIndicator tone="ready">Ready</StatusIndicator>);
    const label = screen.getByText('Ready');
    expect(label).toHaveClass('font-mono', 'uppercase', 'text-success');
    expect(label.previousElementSibling).toHaveClass('size-3', 'bg-success');
    expect(label.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
  });
});
