import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatGPTConnection } from '@/components/settings/chatgpt-connection';

// Mock only the network and translations; retain the component's real timers.
const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), t: (key: string) => key }));
vi.mock('@/lib/api/client', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: mocks.t }) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.apiFetch.mockReset();
});

describe('ChatGPT model discovery', () => {
  it('automatically loads models after login without cancelling the catalog request', async () => {
    vi.useFakeTimers();
    let finishModels: (value: Response) => void = () => undefined;
    let modelSignal: AbortSignal | undefined;
    mocks.apiFetch.mockImplementation(async (path: string, options: RequestInit) => {
      if (path.endsWith('/status')) return Response.json({ connected: false, pending: false });
      if (path.endsWith('/login'))
        return Response.json({
          user_code: 'ABCD',
          interval: 5,
          expires_at: Date.now() / 1000 + 900,
          verification_url: 'https://auth.openai.com/codex/device',
        });
      if (path.endsWith('/poll'))
        return Response.json({ connected: true, pending: false, email: 'test@example.com' });
      if (path.endsWith('/logout')) return Response.json({ connected: false });
      if (path.endsWith('/models')) {
        modelSignal = options.signal as AbortSignal;
        return new Promise<Response>((resolve) => {
          finishModels = resolve;
        });
      }
      throw new Error('Unexpected endpoint');
    });
    const select = vi.fn();
    const refreshHealth = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatGPTConnection model="" onModelChange={select} onConnectionChange={refreshHealth} />
    );
    await act(async () => {});
    expect(refreshHealth).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('settings.chatgpt.signIn'));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Login-poll cleanup previously aborted this separate model fetch.
    expect(modelSignal).toBeDefined();
    expect(modelSignal?.aborted).toBe(false);
    await act(async () => {
      finishModels(
        Response.json({
          models: [
            { id: 'account-sol', name: 'Account Sol' },
            { id: 'account-luna', name: 'Account Luna' },
          ],
        })
      );
    });
    expect(select).toHaveBeenCalledWith('account-sol');
    expect(screen.getByText('settings.llmConfiguration.modelLabel')).toBeInTheDocument();
    expect(mocks.apiFetch.mock.calls.filter(([path]) => path.endsWith('/models'))).toHaveLength(1);

    // Connection changes must invalidate an earlier offline/online status.
    expect(refreshHealth).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('settings.chatgpt.disconnect'));
    await act(async () => {});
    expect(refreshHealth).toHaveBeenCalledTimes(2);
  });
});
