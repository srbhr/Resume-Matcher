import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

describe('PageFrame + PageHeader', () => {
  it('frames the page on the blueprint grid', () => {
    const { container } = render(
      <PageFrame width="wide">
        <p>content</p>
      </PageFrame>
    );
    expect(container.firstChild).toHaveClass('bg-blueprint', 'bg-canvas');
    expect(screen.getByText('content').parentElement).toHaveClass(
      'border',
      'border-ink',
      'shadow-sw-lg',
      'max-w-[104rem]'
    );
  });

  it('keeps bg-blueprint next to a background colour in either order (cn)', () => {
    expect(cn('bg-blueprint', 'bg-canvas')).toBe('bg-blueprint bg-canvas');
    expect(cn('bg-canvas', 'bg-blueprint')).toBe('bg-canvas bg-blueprint');
  });

  it('renders one header recipe: back link, bold serif H1, steel subtitle', () => {
    render(
      <PageHeader>
        <PageHeader.Back href="/dashboard">Dashboard</PageHeader.Back>
        <PageHeader.Title>Settings</PageHeader.Title>
        <PageHeader.Subtitle>Configure your providers</PageHeader.Subtitle>
      </PageHeader>
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('border-ink', 'h-8');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toHaveClass(
      'font-serif',
      'font-bold',
      'uppercase',
      'text-4xl',
      'md:text-5xl'
    );
    expect(screen.getByText(/Configure your providers/)).toHaveClass('text-steel');
    expect(screen.getByText(/Configure your providers/).textContent?.startsWith('// ')).toBe(true);
  });
});
