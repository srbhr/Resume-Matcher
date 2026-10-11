import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsSupportStrip } from '@/components/settings/community';

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
