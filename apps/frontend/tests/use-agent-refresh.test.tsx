import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AGENT_REFRESH_INTERVAL_MS, useAgentRefresh } from '@/hooks/use-agent-refresh';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useAgentRefresh', () => {
  it('waits for a slow refresh instead of starting another that would replace it', async () => {
    let finish: () => void = () => {};
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    renderHook(() => useAgentRefresh(true, refresh));

    await vi.advanceTimersByTimeAsync(AGENT_REFRESH_INTERVAL_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(AGENT_REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does nothing while disabled', async () => {
    const refresh = vi.fn();
    renderHook(() => useAgentRefresh(false, refresh));
    await vi.advanceTimersByTimeAsync(AGENT_REFRESH_INTERVAL_MS * 3);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(refresh).not.toHaveBeenCalled();
  });
});
