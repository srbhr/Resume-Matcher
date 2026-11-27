import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartLoadFailed, withFallback } from '@/components/common/lazy-fallback';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

/**
 * A lazy part whose code fails to load is replaced on its own, instead of the
 * App Router's render-time throw taking the whole page to its error boundary.
 */
afterEach(() => vi.restoreAllMocks());

const Panel = ({ name }: { name: string }) => <p>{name}</p>;

describe('withFallback', () => {
  it('passes the loaded component through', async () => {
    const loaded = await withFallback(Promise.resolve(Panel), 'Panel', PartLoadFailed);
    expect(loaded).toBe(Panel);
  });

  it('logs a failed load and resolves to the fallback instead of rejecting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('ChunkLoadError');

    const loaded = await withFallback(Promise.reject(failure), 'Panel', PartLoadFailed);

    expect(loaded).toBe(PartLoadFailed);
    expect(warn).toHaveBeenCalledWith('Panel failed to load.', failure);
  });

  it('shows the panel fallback as an error alert', () => {
    render(<PartLoadFailed />);
    expect(screen.getByRole('alert')).toHaveTextContent('common.partLoadFailed');
  });
});
