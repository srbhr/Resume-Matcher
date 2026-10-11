import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LlmSetupAlert } from '@/components/common/llm-setup-alert';
import { DefaultBadge } from '@/components/common/default-badge';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

describe('LlmSetupAlert', () => {
  it('is a warning alert that links to /settings', () => {
    render(
      <LlmSetupAlert
        titleKey="dashboard.llmNotConfiguredTitle"
        messageKey="dashboard.llmNotConfiguredMessage"
        actionKey="nav.settings"
      />
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-warning', 'bg-warning-tint');
    expect(screen.getByText('dashboard.llmNotConfiguredTitle')).toBeInTheDocument();
    expect(screen.getByText('dashboard.llmNotConfiguredMessage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.settings' })).toHaveAttribute('href', '/settings');
  });
});

describe('DefaultBadge', () => {
  it('renders its children as the mono ink-bordered marker', () => {
    render(<DefaultBadge>Default</DefaultBadge>);
    const badge = screen.getByText('Default');
    expect(badge).toHaveClass('font-mono', 'uppercase', 'border', 'border-ink');
  });
});
