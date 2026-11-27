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

  it('offers the queue, tracker and settings as labelled buttons in the header, with no search', () => {
    render(<SwissGrid>{null}</SwissGrid>);

    const header = screen.getByRole('heading', { level: 1 }).closest('header');
    const nav = screen.getByRole('navigation', { name: 'nav.primary' });
    expect(header).toContainElement(nav);
    for (const [name, href] of [
      ['nav.queue', '/queue'],
      ['nav.applicationTracker', '/tracker'],
      ['nav.settings', '/settings'],
    ]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      // A visible name beside its icon, in the outline button style.
      expect(link).toHaveTextContent(name);
      expect(link.querySelector('svg')).not.toBeNull();
      expect(link).toHaveClass('border', 'border-ink', 'shadow-sw-sm');
      expect(link.parentElement).toBe(nav);
    }
    expect(screen.queryByRole('button', { name: /search/i })).toBeNull();
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
