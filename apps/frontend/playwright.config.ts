import { defineConfig, devices } from '@playwright/test';

/**
 * Browser specs in `e2e/`. Run only by hand, after the owner approves:
 * `npm run test:e2e`. Never in the pre-push hook.
 *
 * The specs stub every `/api/v1` call in the browser (`page.route`), and the dev
 * server's backend origin points at a closed port, so no run reaches a real
 * backend, API key or model. Stop any other `next dev` first: both use `.next`.
 */
const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // Hides the Next.js dev indicator in screenshots (see the file).
  expect: { toHaveScreenshot: { stylePath: './e2e/screenshot.css' } },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Motion is feedback only; reduced motion keeps screenshots stable.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev --turbopack -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { BACKEND_ORIGIN: 'http://127.0.0.1:9' },
  },
});
