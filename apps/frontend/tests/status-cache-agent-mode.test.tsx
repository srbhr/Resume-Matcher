import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { StatusCacheProvider, useStatusCache } from '@/lib/context/status-cache';

const api = vi.hoisted(() => ({ fetchSystemStatus: vi.fn(), fetchLlmConfig: vi.fn() }));
vi.mock('@/lib/api/config', () => ({
  fetchSystemStatus: (...args: unknown[]) => api.fetchSystemStatus(...args),
  fetchLlmConfig: (...args: unknown[]) => api.fetchLlmConfig(...args),
}));

const status = (agentMode: boolean) => ({
  status: 'ready',
  llm_configured: !agentMode,
  llm_healthy: !agentMode,
  agent_mode: agentMode,
  has_master_resume: true,
  database_stats: {
    total_resumes: 1,
    total_jobs: 0,
    total_improvements: 0,
    has_master_resume: true,
  },
});

function AgentModeProbe() {
  const { status: current } = useStatusCache();
  return <output data-testid="agent-mode">{String(current?.agent_mode ?? 'loading')}</output>;
}

async function renderProvider() {
  render(
    <StatusCacheProvider>
      <AgentModeProbe />
    </StatusCacheProvider>
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  api.fetchSystemStatus.mockReset().mockResolvedValue(status(false));
  api.fetchLlmConfig.mockReset().mockResolvedValue({ provider: 'openai' });
});
afterEach(() => vi.useRealTimers());

describe('status cache and agent mode switched on from outside the app', () => {
  it('picks up agent mode when the page is shown again, without a reload', async () => {
    await renderProvider();
    expect(screen.getByTestId('agent-mode')).toHaveTextContent('false');

    // The coding agent switches agent mode on through the config API.
    api.fetchLlmConfig.mockResolvedValue({ provider: 'agent' });
    api.fetchSystemStatus.mockResolvedValue(status(true));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId('agent-mode')).toHaveTextContent('true');
  });

  it('picks it up while the page stays open, too', async () => {
    await renderProvider();
    api.fetchLlmConfig.mockResolvedValue({ provider: 'agent' });
    api.fetchSystemStatus.mockResolvedValue(status(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByTestId('agent-mode')).toHaveTextContent('true');
  });

  it('reads only the saved provider while nothing changed, so no model health check runs', async () => {
    await renderProvider();
    expect(api.fetchSystemStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(api.fetchLlmConfig).toHaveBeenCalled();
    expect(api.fetchSystemStatus).toHaveBeenCalledTimes(1);
  });
});
