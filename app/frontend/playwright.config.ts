import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8000';
const parsedBaseURL = new URL(baseURL);
const isLocalTarget = ['localhost', '127.0.0.1', '::1'].includes(parsedBaseURL.hostname);

if (!isLocalTarget && process.env.E2E_ALLOW_REMOTE !== '1') {
  throw new Error(
    `Refusing remote E2E target ${baseURL}. Set E2E_ALLOW_REMOTE=1 only for an explicit review.`,
  );
}

const e2eRuntimeDir = path.join(os.tmpdir(), 'ai-tutor-playwright');
const authStatePath = path.join(e2eRuntimeDir, 'auth.json');

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  outputDir: path.join(e2eRuntimeDir, 'test-results'),
  snapshotDir: './tests/__snapshots__',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: path.join(e2eRuntimeDir, 'report'), open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    colorScheme: 'light',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'baseline',
      dependencies: ['setup'],
      testMatch: /app-baseline\.spec\.ts/,
      use: { storageState: authStatePath },
    },
    {
      name: 'clinical',
      testMatch: /clinical-assistant\.spec\.ts/,
    },
  ],
});
