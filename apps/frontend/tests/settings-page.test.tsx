import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/app/(default)/settings/page';

const api = vi.hoisted(() => ({
  fetchLlmConfig: vi.fn(),
  updateLlmConfig: vi.fn(),
  fetchApiKeyStatus: vi.fn(),
  refreshStatus: vi.fn(),
  setUiLanguage: vi.fn(),
  setContentLanguage: vi.fn(),
  unavailable: () => Promise.reject(new Error('not under test')),
}));
// Module-level so the page's load effect (deps: [t]) runs once.
const t = (key: string) => key;
const systemStatus = {
  status: 'setup_required' as const,
  llm_configured: false,
  llm_healthy: true,
  has_master_resume: false,
  database_stats: {
    total_resumes: 3,
    total_jobs: 2,
    total_improvements: 1,
    has_master_resume: false,
  },
};

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t, locale: 'en' }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: systemStatus,
    isLoading: false,
    lastFetched: null,
    refreshStatus: api.refreshStatus,
  }),
}));
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({
    contentLanguage: 'en',
    uiLanguage: 'en',
    setContentLanguage: api.setContentLanguage,
    setUiLanguage: api.setUiLanguage,
    languageNames: { en: 'English', es: 'Español' },
    supportedLanguages: ['en', 'es'],
    isLoading: false,
  }),
}));
vi.mock('@/lib/api/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/config')>();
  return {
    ...actual,
    fetchLlmConfig: api.fetchLlmConfig,
    updateLlmConfig: api.updateLlmConfig,
    fetchApiKeyStatus: api.fetchApiKeyStatus,
    updateApiKeys: api.unavailable,
    testLlmConnection: api.unavailable,
    fetchFeatureConfig: api.unavailable,
    fetchPromptConfig: api.unavailable,
    fetchFeaturePrompts: api.unavailable,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchLlmConfig.mockResolvedValue({
    provider: 'openai',
    model: 'gpt-5-nano',
    api_base: null,
    reasoning_effort: null,
  });
  api.fetchApiKeyStatus.mockResolvedValue({
    providers: [{ provider: 'openai', configured: true, masked_key: 'sk-…1234' }],
  });
  api.updateLlmConfig.mockResolvedValue({});
  api.refreshStatus.mockResolvedValue(undefined);
});

async function renderLoaded() {
  render(<SettingsPage />);
  // The saved-key list only appears once the load effect has resolved.
  await screen.findByRole('button', { name: 'settings.apiKeys.deleteAria' });
}

/** A StatusIndicator label: its sibling is the 12px square, never an icon. */
function expectStatusSquare(label: HTMLElement, square: string) {
  const sibling = label.previousElementSibling;
  expect(sibling?.tagName).toBe('SPAN');
  expect(sibling).toHaveClass('size-3', square);
}

describe('settings page (Swiss sweep)', () => {
  it('has one page title and serif, sentence-case section headings', async () => {
    await renderLoaded();

    const titles = screen.getAllByRole('heading', { level: 1 });
    expect(titles).toHaveLength(1);
    expect(titles[0]).toHaveTextContent('settings.title');

    const sections = screen.getAllByRole('heading', { level: 2 });
    expect(sections.map((h) => h.textContent)).toEqual([
      'settings.systemStatus.title',
      'settings.llmConfigurationTitle',
      'settings.contentGeneration.title',
      'settings.languageTitle',
      'settings.dangerZone',
    ]);
    for (const heading of sections) {
      expect(heading).toHaveClass('font-serif', 'font-bold', 'text-ink');
      expect(heading).not.toHaveClass('font-mono');
      expect(heading).not.toHaveClass('uppercase');
    }
  });

  it('flags missing setup with a warning Alert', async () => {
    await renderLoaded();
    const alert = screen.getByText('settings.setupRequired.title').closest('[role="alert"]');
    expect(alert).toHaveClass('border-warning', 'bg-warning-tint');
    expectStatusSquare(screen.getByText('settings.setupRequired.title'), 'bg-warning');
  });

  it('reports status with a labelled square, not an icon', async () => {
    await renderLoaded();
    expectStatusSquare(screen.getByText('settings.statusValues.healthy'), 'bg-success');
    expectStatusSquare(screen.getByText('settings.statusValues.connected'), 'bg-success');
    expectStatusSquare(screen.getByText('settings.statusValues.notSet'), 'bg-warning');
    expectStatusSquare(screen.getByText('settings.footer.status.setupRequired'), 'bg-warning');
  });

  it('chooses provider and languages through labelled radiogroups', async () => {
    await renderLoaded();

    const providers = screen.getByRole('radiogroup', { name: 'settings.providerLabel' });
    expect(within(providers).getByRole('radio', { name: 'OpenAI' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(within(providers).getByRole('radio', { name: 'Anthropic' }));
    expect(within(providers).getByRole('radio', { name: 'Anthropic' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByLabelText('settings.llmConfiguration.modelLabel')).toHaveValue(
      'claude-haiku-4-5-20251001'
    );

    const ui = screen.getByRole('radiogroup', { name: 'settings.uiLanguage' });
    fireEvent.click(within(ui).getByRole('radio', { name: 'Español' }));
    expect(api.setUiLanguage).toHaveBeenCalledWith('es');

    const content = screen.getByRole('radiogroup', { name: 'settings.contentLanguage' });
    fireEvent.click(within(content).getByRole('radio', { name: 'Español' }));
    expect(api.setContentLanguage).toHaveBeenCalledWith('es');
  });

  it('swaps the Save label for Saved after a successful save', async () => {
    await renderLoaded();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    });
    expect(api.updateLlmConfig).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'common.saved' })).toBeInTheDocument();
  });

  it('marks saved keys with a status label and destructive outline actions', async () => {
    await renderLoaded();
    const savedKey = screen.getByText('sk-…1234').closest('li') as HTMLElement;
    expectStatusSquare(within(savedKey).getByText('OpenAI'), 'bg-success');
    expect(
      within(savedKey).getByRole('button', { name: 'settings.apiKeys.deleteAria' })
    ).toHaveClass('border-destructive', 'text-destructive');

    expect(screen.getByRole('button', { name: 'settings.clearApiKeys' })).toHaveClass(
      'border-destructive',
      'text-destructive'
    );
    const dangerCards = screen
      .getAllByRole('heading', { level: 3 })
      .filter((h) =>
        ['settings.clearApiKeys', 'settings.resetDatabase'].includes(h.textContent ?? '')
      );
    expect(dangerCards).toHaveLength(2);
    for (const heading of dangerCards) expect(heading).toHaveClass('font-serif', 'text-ink');
  });
});
