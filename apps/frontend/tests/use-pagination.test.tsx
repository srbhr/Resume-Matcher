import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePagination } from '@/components/preview/use-pagination';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

describe('usePagination', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'fonts');
  });

  it('stops calculating when measuring the page fails', async () => {
    // jsdom has neither ResizeObserver nor document.fonts.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const element = document.createElement('div');
    Object.defineProperty(element, 'scrollHeight', {
      get: () => {
        throw new Error('layout unavailable');
      },
    });

    const measurementRef = { current: element };
    const { result } = renderHook(() =>
      usePagination({
        pageSize: DEFAULT_TEMPLATE_SETTINGS.pageSize,
        margins: DEFAULT_TEMPLATE_SETTINGS.margins,
        measurementRef,
      })
    );

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(result.current.isCalculating).toBe(false);
  });
});
