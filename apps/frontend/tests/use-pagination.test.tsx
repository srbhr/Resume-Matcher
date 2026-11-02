import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePagination } from '@/components/preview/use-pagination';
import { getContentAreaPx } from '@/lib/constants/page-dimensions';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

/** jsdom has neither ResizeObserver nor document.fonts. */
function stubBrowserApis() {
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
}

describe('usePagination', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'fonts');
  });

  it('stops calculating when measuring the page fails', async () => {
    stubBrowserApis();
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

  it('still splits a long resume into pages when its keep zones cannot be read', async () => {
    stubBrowserApis();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { pageSize, margins } = DEFAULT_TEMPLATE_SETTINGS;
    const pageHeight = getContentAreaPx(pageSize, margins).height;
    const contentHeight = pageHeight * 2.5;
    const element = document.createElement('div');
    Object.defineProperty(element, 'scrollHeight', { value: contentHeight });
    element.getBoundingClientRect = () => {
      throw new Error('layout unavailable');
    };
    const measurementRef = { current: element };

    const { result } = renderHook(() => usePagination({ pageSize, margins, measurementRef }));

    await waitFor(() => expect(result.current.pages).toHaveLength(3));
    expect(result.current.pages.map(({ contentOffset }) => contentOffset)).toEqual([
      0,
      pageHeight,
      pageHeight * 2,
    ]);
    expect(result.current.pages[2].contentEnd).toBe(contentHeight);
    expect(result.current.isCalculating).toBe(false);
    expect(consoleError).toHaveBeenCalled();
  });
});
