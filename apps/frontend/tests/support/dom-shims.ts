import { vi } from 'vitest';

/**
 * Browser APIs jsdom lacks but a page's real tree reads: the paginated preview
 * waits on `document.fonts.ready` and measures with `ResizeObserver`. Call it in
 * `beforeEach`; `removeDomShims` in `afterEach`.
 */
export function installDomShims(): void {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
}

export function removeDomShims(): void {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fonts');
}
