import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommunityLinks, type CommunityLinksVariant } from '@/components/common/community-links';
import { COMMUNITY_LINKS } from '@/lib/constants/community-links';

// Real English labels, so a missing locale key (which renders as the key) fails here too.
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage: 'en' }),
}));

const VARIANTS: CommunityLinksVariant[] = ['hero', 'strip', 'builder', 'settings', 'about'];

const names = (variant: CommunityLinksVariant) => {
  const { unmount } = render(<CommunityLinks variant={variant} />);
  const found = screen.getAllByRole('link').map((link) => link.textContent);
  unmount();
  return found;
};

describe('community links', () => {
  it('points the five links at the owner profile, repo, sponsors, contributors and Discord', () => {
    expect(COMMUNITY_LINKS).toEqual({
      follow: 'https://github.com/srbhr',
      star: 'https://github.com/srbhr/Resume-Matcher',
      sponsor: 'https://github.com/sponsors/srbhr',
      contributors: 'https://github.com/srbhr/Resume-Matcher/graphs/contributors',
      discord: 'https://dsc.gg/resume-matcher',
    });

    render(<CommunityLinks variant="strip" />);
    const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(hrefOf('Follow @srbhr')).toBe('https://github.com/srbhr');
    expect(hrefOf('Star')).toBe('https://github.com/srbhr/Resume-Matcher');
    expect(hrefOf('Sponsor')).toBe('https://github.com/sponsors/srbhr');
    expect(hrefOf('Discord')).toBe('https://dsc.gg/resume-matcher');
    expect(hrefOf('Contributors')).toBe(
      'https://github.com/srbhr/Resume-Matcher/graphs/contributors'
    );
  });

  it.each(VARIANTS)('opens every %s link in a new tab, with no referrer leak', (variant) => {
    render(<CommunityLinks variant={variant} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('is links only: no external images', () => {
    const { container } = render(<CommunityLinks variant="about" />);
    expect(container.querySelector('img')).toBeNull();
    expect(within(container).getAllByRole('link')).toHaveLength(5);
  });

  it('shows each placement its own set of links', () => {
    expect(names('hero')).toEqual(['Follow @srbhr', 'Sponsor', 'Discord']);
    expect(names('strip')).toEqual(['Follow @srbhr', 'Star', 'Sponsor', 'Discord', 'Contributors']);
    expect(names('builder')).toEqual(['Join Discord', 'Star on GitHub']);
    expect(names('settings')).toEqual(['Sponsor the project', 'Join the Discord']);
    expect(names('about')).toEqual([
      'Follow @srbhr',
      'Star on GitHub',
      'Sponsor',
      'Join Discord',
      'Contributors',
    ]);
  });
});
