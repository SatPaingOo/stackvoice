import { defineConfig, devices } from '@playwright/test';

const PORT = 8790;

/**
 * End-to-end tests drive the real server in a real browser engine.
 *
 * They use the Edge already installed on the machine rather than downloading a
 * browser, and a settings file of their own, so they never touch
 * config/settings.yml or collide with a server running on the default port.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // Not *.test.ts or *.spec.ts: vitest's default glob would pick those up too.
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge', headless: true } }],
  webServer: {
    // A scratch copy of config/apps and a data folder of its own, so tests can add apps and keys.
    command: 'node tests/e2e/prepare.mjs && npx tsx src/main.ts tests/e2e/settings.yml tests/e2e/.work/apps',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
