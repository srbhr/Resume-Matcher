import { setupServer } from 'msw/node';
import type { RequestHandler } from 'msw';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';

/**
 * Start an MSW server for this test file. A request no handler answers fails the
 * test: `onUnhandledFrame: 'error'` alone only rejects the fetch, which app code
 * may catch and hide. (msw 3 renamed `onUnhandledRequest` to `onUnhandledFrame`.)
 */
export function startMsw(...handlers: RequestHandler[]) {
  const server = setupServer(...handlers);
  const unhandled: string[] = [];

  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
    server.events.on('request:unhandled', ({ request }) => {
      unhandled.push(`${request.method} ${new URL(request.url).pathname}`);
    });
  });
  afterEach(() => {
    server.resetHandlers();
    expect(unhandled.splice(0), 'requests no MSW handler answered').toEqual([]);
  });
  afterAll(() => server.close());

  return server;
}
