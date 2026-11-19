import { vi } from 'vitest';

/**
 * A `next/navigation` double for page specs. It imports nothing from the app, so
 * `vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation)`
 * can load it while the app is still importing `next/navigation`.
 */

/** The query string the page reads. Change `search`, then rerender, to switch document. */
export const route = { search: 'id=res-1' };
export const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
export const navigation = {
  useSearchParams: () => new URLSearchParams(route.search),
  useRouter: () => router,
  usePathname: () => '/builder',
};
