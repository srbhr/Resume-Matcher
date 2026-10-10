import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/app/(default)/settings/page';
import { FeaturePromptsError } from '@/lib/api/config';

const api = vi.hoisted(() => ({
  fetchLlmConfig: vi.fn(),
  updateLlmConfig: vi.fn(),
  fetchApiKeyStatus: vi.fn(),
  fetchFeatureConfig: vi.fn(),
  testLlmConnection: vi.fn(),
  updateFeaturePrompts: vi.fn(),
  refreshStatus: vi.fn(),
  setUiLanguage: vi.fn(),
  setContentLanguage: vi.fn(),
  unavailable: () => Promise.reject(new Error('not under test')),
}));
// Module-level so the page's load effect (deps: [t]) runs once.
const t = (key: string) => key;
let currentStatus: typeof systemStatus | null = null;
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
    status: currentStatus,
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
    testLlmConnection: api.testLlmConnection,
    fetchFeatureConfig: api.fetchFeatureConfig,
    updateFeaturePrompts: api.updateFeaturePrompts,
    fetchPromptConfig: api.unavailable,
    fetchFeaturePrompts: api.unavailable,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  currentStatus = systemStatus;
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
  // Per-test overrides must not leak: reset to "unavailable" every time.
  api.fetchFeatureConfig.mockImplementation(api.unavailable);
  api.testLlmConnection.mockImplementation(api.unavailable);
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

  it('shows a monochrome brand mark on each provider segment except OpenAI-compatible', async () => {
    await renderLoaded();
    const providers = screen.getByRole('radiogroup', { name: 'settings.providerLabel' });

    for (const name of [
      'OpenAI',
      'Azure',
      'Anthropic',
      'OpenRouter',
      'Google',
      'DeepSeek',
      'Groq',
      'Ollama',
    ]) {
      const mark = within(providers).getByRole('radio', { name }).querySelector('svg');
      expect(mark, `${name} mark`).not.toBeNull();
      // Decorative beside the visible name; sized by the caller; paints with the segment's text colour.
      expect(mark).toHaveAttribute('aria-hidden', 'true');
      expect(mark).toHaveClass('size-4');
      for (const shape of Array.from(mark!.children)) {
        expect(shape).toHaveAttribute('fill', 'currentColor');
      }
    }
    expect(
      within(providers).getByRole('radio', { name: 'OpenAI-Compatible' }).querySelector('svg')
    ).toBeNull();

    // The selected segment is ink with white text; the mark sits inside it and inherits that colour.
    expect(within(providers).getByRole('radio', { name: 'OpenAI' })).toHaveClass(
      'bg-ink',
      'text-white'
    );
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

  it('sits in the narrow frame and lets its form columns fill it', async () => {
    api.fetchFeatureConfig.mockResolvedValue({
      enable_cover_letter: true,
      enable_outreach_message: true,
      enable_interview_prep: false,
    });
    const { container } = render(<SettingsPage />);
    await screen.findByRole('button', { name: 'settings.apiKeys.deleteAria' });

    const frame = screen.getByRole('heading', { level: 1 }).closest('.shadow-sw-lg') as HTMLElement;
    expect(frame).toHaveClass('max-w-4xl');
    expect(frame).not.toHaveClass('max-w-[86rem]');

    // No inner column cap: fields and prompts fill the frame instead of leaving a gap.
    expect(container.querySelector('.max-w-3xl')).toBeNull();
    const llmFields = screen
      .getByLabelText('settings.llmConfiguration.modelLabel')
      .closest('.grid') as HTMLElement;
    expect(llmFields).toHaveClass('gap-6');
    const promptBody = screen.getByText('settings.contentGeneration.description')
      .parentElement as HTMLElement;
    for (const id of ['coverLetterPrompt', 'outreachPrompt']) {
      expect(promptBody).toContainElement(document.getElementById(id));
    }
  });

  it('keeps the compact vertical rhythm: tight body padding, 8-unit section gaps', async () => {
    await renderLoaded();
    const body = screen.getByText('settings.systemStatus.title').closest('section')
      ?.parentElement as HTMLElement;
    expect(body).toHaveClass('py-8', 'space-y-8');
    for (const old of ['py-12', 'md:py-12', 'space-y-12']) expect(body).not.toHaveClass(old);
    // The horizontal gutter matches the shared page header (md:p-12) so edges align.
    expect(body).toHaveClass('px-8', 'md:px-12');
  });

  it('gives nested boxes the nested shadow and keeps solid ink for controls', async () => {
    api.testLlmConnection.mockResolvedValue({
      healthy: true,
      provider: 'openai',
      model: 'gpt-5-nano',
      test_prompt: 'ping prompt',
      model_output: 'pong output',
      reasoning_content: 'thinking trace',
    });
    const { container } = render(<SettingsPage />);
    await screen.findByRole('button', { name: 'settings.apiKeys.deleteAria' });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'settings.llmConfiguration.testConnection' })
      );
    });
    await screen.findByRole('status');

    const statBoxes = [
      'settings.statusCards.llm',
      'settings.statusCards.database',
      'settings.statusCards.resumes',
      'settings.statusCards.jobs',
      'settings.statusCards.improvements',
      'settings.statusCards.masterResume',
    ].map((label) => screen.getByText(label).closest('.border') as HTMLElement);
    const savedKeys = screen.getByText('settings.apiKeys.savedTitle').parentElement as HTMLElement;
    const detailBlocks = ['ping prompt', 'pong output', 'thinking trace'].map((text) =>
      screen.getByText(text)
    );
    for (const box of [...statBoxes, savedKeys, ...detailBlocks]) {
      expect(box).toHaveClass('border-ink', 'shadow-sw-nested');
      expect(box).not.toHaveClass('shadow-sw-sm');
    }

    // Solid `sm` shadow is for pressable controls only.
    const solid = Array.from(container.querySelectorAll('.shadow-sw-sm'));
    expect(solid.length).toBeGreaterThan(0);
    // The Back link is a link styled with buttonClass.
    for (const el of solid) expect(['BUTTON', 'A']).toContain(el.tagName);
  });

  it('gives every action button type="button"', async () => {
    api.fetchFeatureConfig.mockResolvedValue({
      enable_cover_letter: true,
      enable_outreach_message: true,
      enable_interview_prep: false,
    });
    await renderLoaded();
    // Includes Test connection and both prompt Save / Reset pairs.
    expect(
      screen.getByRole('button', { name: 'settings.llmConfiguration.testConnection' })
    ).toHaveAttribute('type', 'button');
    expect(
      screen.getAllByRole('button', { name: 'settings.contentGeneration.customPromptResetButton' })
    ).toHaveLength(2);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
    }
  });

  it('sets the footer on canvas, not panel', async () => {
    await renderLoaded();
    const footer = screen
      .getByText('settings.footer.status.setupRequired')
      .closest('.justify-between');
    expect(footer).toHaveClass('bg-canvas', 'border-t');
    expect(footer).not.toHaveClass('bg-panel');
    expect(footer).not.toHaveClass('bg-secondary');
  });

  it('renders health-check detail blocks in the mono face', async () => {
    api.testLlmConnection.mockResolvedValue({
      healthy: true,
      provider: 'openai',
      model: 'gpt-5-nano',
      test_prompt: 'ping prompt',
      model_output: 'pong output',
      reasoning_content: 'thinking trace',
    });
    await renderLoaded();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'settings.llmConfiguration.testConnection' })
      );
    });

    const result = await screen.findByRole('status');
    expectStatusSquare(
      within(result).getByText('settings.llmConfiguration.connectionSuccessful'),
      'bg-success'
    );
    for (const text of ['ping prompt', 'pong output', 'thinking trace']) {
      const block = within(result).getByText(text);
      expect(block.tagName).toBe('PRE');
      expect(block).toHaveClass('font-mono');
    }
  });
});

describe('settings page (accessibility)', () => {
  it('guards the credential and endpoint fields against autofill and spellcheck', async () => {
    await renderLoaded();

    const key = document.getElementById('apiKey') as HTMLInputElement;
    expect(key).toHaveAttribute('type', 'password');
    expect(key).toHaveAttribute('name', 'llm-api-key');
    // Browsers ignore autocomplete="off" on a password field; new-password stops the suggest popup.
    expect(key).toHaveAttribute('autocomplete', 'new-password');
    expect(key).toHaveAttribute('spellcheck', 'false');

    const model = screen.getByLabelText('settings.llmConfiguration.modelLabel');
    expect(model).toHaveAttribute('autocomplete', 'off');
    expect(model).toHaveAttribute('spellcheck', 'false');

    const base = document.getElementById('apiBase') as HTMLInputElement;
    expect(base).toHaveAttribute('type', 'url');
    expect(base).toHaveAttribute('inputmode', 'url');
    expect(base).toHaveAttribute('autocomplete', 'off');
    expect(base).toHaveAttribute('spellcheck', 'false');
    expect(base).toHaveAttribute('aria-required', 'false');
  });

  it('marks the base URL required for providers that need one', async () => {
    await renderLoaded();
    const providers = screen.getByRole('radiogroup', { name: 'settings.providerLabel' });
    fireEvent.click(within(providers).getByRole('radio', { name: 'Azure' }));
    expect(document.getElementById('apiBase')).toHaveAttribute('aria-required', 'true');
  });

  it('announces a rejected feature prompt and ties it to its textarea', async () => {
    api.fetchFeatureConfig.mockResolvedValue({
      enable_cover_letter: true,
      enable_outreach_message: true,
      enable_interview_prep: false,
    });
    api.updateFeaturePrompts.mockRejectedValue(
      new FeaturePromptsError({
        code: 'missing_placeholders',
        field: 'cover_letter_prompt',
        missing: ['{job_description}'],
      })
    );
    await renderLoaded();
    const cover = document.getElementById('coverLetterPrompt') as HTMLTextAreaElement;
    const outreach = document.getElementById('outreachPrompt') as HTMLTextAreaElement;
    expect(cover).not.toHaveAttribute('aria-invalid', 'true');

    await act(async () => {
      fireEvent.click(
        within(cover.closest('.pl-6') as HTMLElement).getByRole('button', { name: 'common.save' })
      );
    });

    const message = (await screen.findByText(
      'settings.contentGeneration.customPromptErrorMissing'
    )) as HTMLElement;
    expect(message).toHaveAttribute('id', 'coverLetterPrompt-error');
    expect(message).toHaveAttribute('role', 'alert');
    expect(cover).toHaveAttribute('aria-invalid', 'true');
    expect(cover).toHaveAttribute('aria-describedby', 'coverLetterPrompt-error');
    // The other field is untouched.
    expect(outreach).not.toHaveAttribute('aria-invalid', 'true');
    expect(outreach).not.toHaveAttribute('aria-describedby');
  });

  it('shows an unreachable backend as an error Alert with a retry, not a dashed box', async () => {
    currentStatus = null;
    render(<SettingsPage />);
    const alert = (await screen.findByText('settings.systemStatus.unableToConnect')).closest(
      '[role="alert"]'
    ) as HTMLElement;
    expect(alert).toHaveClass('border-2', 'border-destructive', 'bg-destructive-tint');
    expect(alert).not.toHaveClass('border-dashed');
    expect(alert).toHaveTextContent('settings.systemStatus.expectedAt');

    fireEvent.click(within(alert).getByRole('button', { name: 'common.retry' }));
    expect(api.refreshStatus).toHaveBeenCalled();
  });

  it('keeps the Save button named while it is saving', async () => {
    api.updateLlmConfig.mockReturnValue(new Promise(() => {}));
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    expect(await screen.findByRole('button', { name: 'common.saving' })).toBeDisabled();
  });

  it('names the Test connection button while the check runs', async () => {
    api.testLlmConnection.mockReturnValue(new Promise(() => {}));
    await renderLoaded();

    fireEvent.click(
      screen.getByRole('button', { name: 'settings.llmConfiguration.testConnection' })
    );
    expect(await screen.findByRole('button', { name: 'common.checking' })).toBeDisabled();
  });
});
