import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsAbout, SettingsSupportStrip } from '@/components/settings/community';
import { APP_VERSION } from '@/lib/config/version';

vi.mock('@/lib/i18n', () => {
  const t = (key: string) => key;
  return { useTranslations: () => ({ t }) };
});

describe('settings community strip', () => {
  it('asks for support at the top with Sponsor and Discord links', () => {
    render(<SettingsSupportStrip />);

    expect(screen.getByText('community.settingsPrompt')).toBeInTheDocument();
    const sponsor = screen.getByRole('link', { name: 'community.sponsorProject' });
    const discord = screen.getByRole('link', { name: 'community.joinTheDiscord' });
    expect(sponsor).toHaveAttribute('href', 'https://github.com/sponsors/srbhr');
    expect(discord).toHaveAttribute('href', 'https://dsc.gg/resume-matcher');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});

describe('settings About section', () => {
  it('shows the app version and all five community links', () => {
    render(<SettingsAbout />);

    expect(screen.getByRole('heading', { level: 2, name: 'community.aboutTitle' })).toBeVisible();
    expect(screen.getByText(`v${APP_VERSION}`)).toBeInTheDocument();
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      'https://github.com/srbhr',
      'https://github.com/srbhr/Resume-Matcher',
      'https://github.com/sponsors/srbhr',
      'https://dsc.gg/resume-matcher',
      'https://github.com/srbhr/Resume-Matcher/graphs/contributors',
    ]);
  });
});
