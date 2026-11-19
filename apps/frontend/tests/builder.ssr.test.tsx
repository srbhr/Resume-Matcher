// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DefaultLayout from '@/app/(default)/layout';
import BuilderPage from '@/app/(default)/builder/page';

/**
 * The builder's server render, in a real server environment (no `document`):
 * it must not depend on anything only the browser knows, such as stored
 * settings, or hydration would mismatch.
 */

vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation);

describe('builder template settings', () => {
  it('server-renders the default template before the resume loads', () => {
    const html = renderToString(
      <DefaultLayout>
        <BuilderPage />
      </DefaultLayout>
    );

    expect(html).toContain('resume-template-swiss-single');
  });
});
