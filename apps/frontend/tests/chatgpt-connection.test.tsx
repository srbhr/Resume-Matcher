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
  it.each([404, 502, 504])(
    'shows a localized fallback for non-JSON HTTP %s errors',
    async (status) => {
      mocks.apiFetch.mockResolvedValue(new Response('<html>Proxy unavailable</html>', { status }));
      render(<ChatGPTConnection model="" onModelChange={vi.fn()} />);
      await act(async () => {});
      expect(screen.getByRole('alert')).toHaveTextContent(
        status === 404 ? 'settings.chatgpt.restartBackend' : 'settings.chatgpt.connectionFailed'
      );
    }
  );

  it('waits for the initial status before allowing sign-in', async () => {
    let finishStatus: (value: Response) => void = () => undefined;
    mocks.apiFetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishStatus = resolve;
        })
    );
    render(<ChatGPTConnection model="" onModelChange={vi.fn()} />);
    const signIn = screen.getByText('settings.chatgpt.signIn');
    expect(signIn).toBeDisabled();
    fireEvent.click(signIn);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishStatus(Response.json({ connected: false, pending: false }));
    });
    expect(signIn).toBeEnabled();
  });

  it('discards a manual catalog refresh after disconnect', async () => {
    let finishRefresh: (value: Response) => void = () => undefined;
    let refreshSignal: AbortSignal | undefined;
    let catalogs = 0;
    mocks.apiFetch.mockImplementation(async (path: string, options: RequestInit) => {
      if (path.endsWith('/status')) return Response.json({ connected: true, pending: false });
      if (path.endsWith('/logout')) return Response.json({ connected: false });
      if (path.endsWith('/models')) {
        catalogs++;
        if (catalogs === 1)
          return Response.json({ models: [{ id: 'original', name: 'Original' }] });
        refreshSignal = options.signal as AbortSignal;
        return new Promise<Response>((resolve) => {
          finishRefresh = resolve;
        });
      }
      throw new Error('Unexpected endpoint');
    });
    const select = vi.fn();
    render(<ChatGPTConnection model="original" onModelChange={select} />);
    await act(async () => {});
    fireEvent.click(screen.getByText('settings.chatgpt.refreshModels'));
    await act(async () => {});
    fireEvent.click(screen.getByText('settings.chatgpt.disconnect'));
    await act(async () => {});
    expect(refreshSignal?.aborted).toBe(true);
    await act(async () => {
      finishRefresh(Response.json({ models: [{ id: 'stale', name: 'Stale' }] }));
    });
    expect(screen.queryByText('settings.llmConfiguration.modelLabel')).not.toBeInTheDocument();
    expect(select).toHaveBeenCalledWith('');
    expect(select).not.toHaveBeenCalledWith('stale');
  });

  it('reports readiness only after the selected model is in the loaded account catalog', async () => {
    let finishModels: (value: Response) => void = () => undefined;
    mocks.apiFetch.mockImplementation(async (path: string) => {
      if (path.endsWith('/status')) return Response.json({ connected: true, pending: false });
      return new Promise<Response>((resolve) => {
        finishModels = resolve;
      });
    });
    const ready = vi.fn();
    const { rerender } = render(
      <ChatGPTConnection model="" onModelChange={vi.fn()} onCatalogReadyChange={ready} />
    );
    await act(async () => {});
    expect(ready).toHaveBeenLastCalledWith(false);
    await act(async () => {
      finishModels(Response.json({ models: [{ id: 'available', name: 'Available' }] }));
    });
    expect(ready).toHaveBeenLastCalledWith(false);
    rerender(
      <ChatGPTConnection model="available" onModelChange={vi.fn()} onCatalogReadyChange={ready} />
    );
    expect(ready).toHaveBeenLastCalledWith(true);
  });
  it.each([400, 401, 403, 404, 429, 503])(
    'handles poll HTTP %s without losing an existing connection',
    async (status) => {
      vi.useFakeTimers();
      mocks.apiFetch.mockImplementation(async (path: string) => {
        if (path.endsWith('/status')) return Response.json({ connected: true, pending: false });
        if (path.endsWith('/models')) return Response.json({ models: [] });
        if (path.endsWith('/login'))
          return Response.json({
            user_code: 'RETRY',
            interval: 5,
            expires_at: Date.now() / 1000 + 900,
            verification_url: 'https://auth.openai.com/codex/device',
          });
        if (path.endsWith('/poll')) return Response.json({ detail: 'Poll failed' }, { status });
        throw new Error('Unexpected endpoint');
      });
      render(<ChatGPTConnection model="" onModelChange={vi.fn()} />);
      await act(async () => {});
      fireEvent.click(screen.getByText('settings.chatgpt.signIn'));
      await act(async () => {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByText('settings.chatgpt.connected')).toBeInTheDocument();
      if ([400, 401, 403, 404].includes(status)) {
        expect(screen.queryByText('RETRY')).not.toBeInTheDocument();
        expect(screen.getByText('settings.chatgpt.signIn')).toBeEnabled();
      } else {
        expect(screen.getByText('RETRY')).toBeInTheDocument();
        expect(screen.getByText('settings.chatgpt.signIn')).toBeDisabled();
      }
    }
  );
});
