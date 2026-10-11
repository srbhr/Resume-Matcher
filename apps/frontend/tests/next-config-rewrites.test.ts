import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

type Rewrite = { source: string; destination: string };

describe('next.config rewrites', () => {
  it('serves the ChatGPT OAuth callback on the frontend port by proxying it to the backend', async () => {
    const rules = (await nextConfig.rewrites?.()) as Rewrite[];
    const callback = rules.find((rule) => rule.source === '/auth/callback');

    expect(callback?.destination).toMatch(/^https?:\/\/[^/]+\/auth\/callback$/);
  });
});
