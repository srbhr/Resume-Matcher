import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';

describe('PageFrame + PageHeader', () => {
  it('frames the page on a plain Canvas base, ready for the background effect', () => {
    const { container } = render(
      <PageFrame width="wide">
        <p>content</p>
      </PageFrame>
    );
    expect(container.firstChild).toHaveClass('relative', 'isolate', 'bg-canvas');
    expect(container.firstChild).not.toHaveClass('bg-blueprint');
    expect(screen.getByText('content').parentElement).toHaveClass(
      'border',
      'border-ink',
      'shadow-sw-lg',
      'max-w-[104rem]'
    );
  });

  it('fills the dynamic viewport in screen mode and leaves the inner frame content-sized', () => {
    const { container } = render(
      <PageFrame height="screen">
        <p>content</p>
      </PageFrame>
    );
    expect(container.firstChild).toHaveClass('h-dvh', 'overflow-hidden');
    expect(container.firstChild).not.toHaveClass('h-screen');
    const frame = screen.getByText('content').parentElement;
    expect(frame).toHaveClass('max-h-full', 'overflow-hidden');
    expect(frame).not.toHaveClass('h-full');
  });

  it('offers a narrow frame for single-column form pages', () => {
    render(
      <PageFrame width="narrow">
        <p>content</p>
      </PageFrame>
    );
    const frame = screen.getByText('content').parentElement;
    expect(frame).toHaveClass('max-w-4xl');
    expect(frame).not.toHaveClass('max-w-[86rem]');
  });

  it('keeps min-h-screen in auto mode', () => {
    const { container } = render(
      <PageFrame>
        <p>content</p>
      </PageFrame>
    );
    expect(container.firstChild).toHaveClass('min-h-screen');
    expect(container.firstChild).not.toHaveClass('h-dvh');
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
