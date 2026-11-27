import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SwissGrid } from '@/components/home/swiss-grid';
import { APP_VERSION } from '@/lib/config/version';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

describe('SwissGrid', () => {
  it('shows the app version beside the brand name in the bottom strip, in the label face', () => {
    render(<SwissGrid>{null}</SwissGrid>);

    const version = screen.getByText(`v${APP_VERSION}`);
    expect(version).toHaveClass('text-steel');
    const brand = screen.getByText('Resume Matcher');
    expect(version.parentElement).toBe(brand.parentElement);
    expect(brand.closest('header')).toBeNull();
    expect(brand.closest('.border-t')).toContainElement(
      screen.getByRole('link', { name: 'community.follow' })
    );
    expect(brand.closest('.font-mono')).toContainElement(version);
  });

  it('keeps the header calm: one bordered search, then quiet links', () => {
    render(<SwissGrid>{null}</SwissGrid>);

    const search = screen.getByRole('button', { name: /commandPalette\.search/ });
    expect(search).toHaveClass('border', 'border-ink', 'bg-white');
    expect(search).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K');
    for (const name of ['nav.queue', 'nav.applicationTracker', 'nav.settings']) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveClass('border-none', 'shadow-none');
      expect(link.parentElement).toBe(search.parentElement);
    }
  });

  it('puts the queue, tracker and a gear settings button in the header, not a footer', () => {
    render(<SwissGrid>{null}</SwissGrid>);

    const header = screen.getByRole('heading', { level: 1 }).closest('header');
    for (const [name, href] of [
      ['nav.queue', '/queue'],
      ['nav.applicationTracker', '/tracker'],
      ['nav.settings', '/settings'],
    ]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(header).toContainElement(link);
    }
    // Settings is an icon button: named for screen readers, no visible label.
    const settings = screen.getByRole('link', { name: 'nav.settings' });
    expect(settings.querySelector('svg')).not.toBeNull();
    expect(settings).toHaveTextContent('');
    expect(settings).toHaveAttribute('title', 'nav.settings');
  });

  it('names the tile region with its own heading, and has no page subtitle', () => {
    render(<SwissGrid>{null}</SwissGrid>);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveClass('sr-only');
    expect(heading).toHaveTextContent('dashboard.modulesHeading');
    // The header has no "// Select module" subtitle any more.
    expect(screen.queryByText(/dashboard\.selectModule/)).toBeNull();
  });

  it('links the tailoring queue as a styled link, not a nested button', () => {
    render(<SwissGrid>{null}</SwissGrid>);

    const link = screen.getByRole('link', { name: 'nav.queue' });
    expect(link).toHaveAttribute('href', '/queue');
    expect(link.querySelector('button')).toBeNull();
    // The header actions wrap on narrow screens instead of clipping.
    expect(link.parentElement).toHaveClass('flex-wrap');
  });

  it('closes the page with a slim community strip right under the tiles', () => {
    render(<SwissGrid>{null}</SwissGrid>);

    const strip = screen.getByRole('link', { name: 'community.follow' }).closest('div');
    for (const name of [
      'community.follow',
      'community.star',
      'community.sponsor',
      'community.discord',
      'community.contributors',
    ]) {
      expect(strip).toContainElement(screen.getByRole('link', { name }));
    }
    // No footer row between the tiles and the strip any more.
    const row = strip!.closest('.border-t');
    const tiles = screen.getByRole('heading', { level: 2 }).parentElement;
    expect(tiles!.nextElementSibling).toBe(row);
    expect(row).toHaveClass('border-t', 'border-ink', 'bg-canvas');
  });
});
