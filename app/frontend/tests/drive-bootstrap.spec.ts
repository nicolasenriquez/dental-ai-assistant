/**
 * Fail-first browser coverage for the authentication-to-Drive bootstrap
 * (task 3.1) and the Phase 3 acceptance proof (task 3.3).
 *
 * All application APIs are mocked at the route boundary; no real Google
 * traffic occurs. `window.location.assign` handoffs are observed as
 * navigation requests to the provider origin (which is itself route-mocked),
 * so each test counts provider handoffs exactly.
 */

import { type Page, expect, test } from '@playwright/test';

const baseURL = 'http://localhost:8000';

const user = {
  id: '55555555-5555-4555-8555-555555555555',
  email: 'ana@gmail.com',
  is_admin: false,
  messages_used_today: 0,
  messages_remaining_today: 25,
  rate_window_resets_at: null,
};

const googleConfig = {
  mode: 'google',
  google_client_id: 'test-client.apps.googleusercontent.com',
  drive_enabled: true,
  drive_auto_onboard: true,
};

const localConfig = {
  mode: 'local',
  google_client_id: null,
  drive_enabled: true,
  drive_auto_onboard: false,
};

const authorizationUrl = 'https://accounts.google.com/o/oauth2/auth?client_id=x&scope=drive.file';

function connectedStatus() {
  return {
    configured: true,
    status: 'connected',
    workspace: { folder_name: 'Dental AI Assistant' },
  };
}

function disconnectedStatus() {
  return { configured: true, status: 'disconnected' };
}

const PROVIDER_URL_PREFIX = 'https://accounts.google.com/';

// `window.location.assign` cannot be reliably shadowed in Chromium, so
// handoffs are observed as browser navigation requests to the provider
// origin. The provider origin is route-mocked in setupDriveMocks, so the
// navigation never leaves the test context.
async function assignCalls(page: Page): Promise<string[]> {
  const w = page as Page & { __providerHandoffs?: string[] };
  return w.__providerHandoffs ?? [];
}

interface DriveSetup {
  config?: unknown;
  driveStatus?: unknown;
  oauthStart?: unknown;
}

async function setupDriveMocks(page: Page, setup: DriveSetup): Promise<void> {
  const oauthStartRequests: string[] = [];

  await page.route('**/api/auth/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(setup.config ?? googleConfig),
    }),
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }),
  );
  await page.route('**/api/google-drive/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(setup.driveStatus ?? connectedStatus()),
    }),
  );
  await page.route('**/api/google-drive/oauth/start', (route) => {
    oauthStartRequests.push(route.request().method());
    if (setup.oauthStart !== undefined) {
      void route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify(setup.oauthStart),
      });
      return;
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorization_url: authorizationUrl }),
    });
  });
  await page.route('**/api/patients', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/clinical-threads*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  // Keep any real provider navigation inside the test context and record it
  // as the observable handoff seam.
  await page.route(`${PROVIDER_URL_PREFIX}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>provider</body></html>',
    }),
  );
  const handoffs: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(PROVIDER_URL_PREFIX)) handoffs.push(request.url());
  });
  const pageWithHandoffs = page as Page & { __providerHandoffs?: string[] };
  pageWithHandoffs.__providerHandoffs = handoffs;
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'session', value: 'test-session-jwt', url: baseURL }]);
});

test('returning Google user with healthy Drive enters Assistant without Drive prompt', async ({
  page,
}) => {
  await setupDriveMocks(page, {});
  const oauthStartCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/google-drive/oauth/start'))
      oauthStartCalls.push(request.method());
  });

  await page.goto('/assistant');

  await expect(page).toHaveURL(/\/assistant$/);
  await expect(page.getByText('Google Drive no está conectado')).toHaveCount(0);
  expect(oauthStartCalls).toEqual([]);
  expect(await assignCalls(page)).toEqual([]);
});

test('first-time Google user gets explicit provider consent through one backend-built URL handoff', async ({
  page,
}) => {
  await setupDriveMocks(page, { driveStatus: disconnectedStatus() });
  const oauthStartCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/google-drive/oauth/start'))
      oauthStartCalls.push(request.method());
  });

  await page.goto('/assistant');

  await expect.poll(async () => oauthStartCalls.length, { timeout: 10_000 }).toBe(1);
  expect(oauthStartCalls).toEqual(['POST']);
  await expect.poll(async () => (await assignCalls(page)).length, { timeout: 10_000 }).toBe(1);
  expect(await assignCalls(page)).toEqual([authorizationUrl]);
});

test('consent denial redirects to ready-without-drive without re-onboarding loop', async ({
  page,
}) => {
  await setupDriveMocks(page, { driveStatus: disconnectedStatus() });
  const oauthStartCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/google-drive/oauth/start'))
      oauthStartCalls.push(request.method());
  });

  await page.goto('/assistant?result=consent_denied');

  await expect(page.getByText('Google Drive no está conectado')).toBeVisible();
  await expect(
    page.getByText(
      'Puedes continuar utilizando Dental AI Assistant. Conecta Drive cuando quieras trabajar con documentos.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar Drive' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(oauthStartCalls).toEqual([]);
  expect(await assignCalls(page)).toEqual([]);
});

test('account mismatch result lands ready-without-drive and never re-onboards', async ({
  page,
}) => {
  await setupDriveMocks(page, { driveStatus: disconnectedStatus() });
  const oauthStartCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/google-drive/oauth/start'))
      oauthStartCalls.push(request.method());
  });

  await page.goto('/assistant?result=account_mismatch');

  await expect(page.getByText('Google Drive no está conectado')).toBeVisible();
  await page.waitForTimeout(500);
  expect(oauthStartCalls).toEqual([]);
});

test('provider error result lands ready-without-drive and never re-onboards', async ({ page }) => {
  await setupDriveMocks(page, { driveStatus: disconnectedStatus() });
  const oauthStartCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/google-drive/oauth/start'))
      oauthStartCalls.push(request.method());
  });

  await page.goto('/assistant?result=provider_error');

  await expect(page.getByText('Google Drive no está conectado')).toBeVisible();
  await page.waitForTimeout(500);
  expect(oauthStartCalls).toEqual([]);
});

test('result=connected returns to ready without banner or second handoff', async ({ page }) => {
  await setupDriveMocks(page, {});
  const oauthStartCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/google-drive/oauth/start'))
      oauthStartCalls.push(request.method());
  });

  await page.goto('/assistant?result=connected');

  await expect(page).toHaveURL(/\/assistant\?result=connected/);
  await expect(page.getByText('Google Drive no está conectado')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(oauthStartCalls).toEqual([]);
});

test('Conectar Drive action starts the explicit handoff exactly once', async ({ page }) => {
  await setupDriveMocks(page, { driveStatus: disconnectedStatus() });

  await page.goto('/assistant?result=consent_denied');
  await page.getByRole('button', { name: 'Conectar Drive' }).click();

  await expect.poll(async () => (await assignCalls(page)).length, { timeout: 10_000 }).toBe(1);
  expect(await assignCalls(page)).toEqual([authorizationUrl]);
});

test('OAuth start failure preserves the Dental session and shows ready-without-drive', async ({
  page,
}) => {
  await setupDriveMocks(page, {
    driveStatus: disconnectedStatus(),
    oauthStart: { error: 'GOOGLE_DRIVE_NOT_CONFIGURED' },
  });

  await page.goto('/assistant?result=consent_denied');
  await page.getByRole('button', { name: 'Conectar Drive' }).click();

  await expect(page.getByText('Google Drive no está conectado')).toBeVisible();
  expect(await assignCalls(page)).toEqual([]);
});

test('local mode does not auto-onboard and keeps manual account choice', async ({ page }) => {
  await setupDriveMocks(page, { config: localConfig, driveStatus: disconnectedStatus() });
  const oauthStartCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/google-drive/oauth/start'))
      oauthStartCalls.push(request.method());
  });

  await page.goto('/assistant');

  await expect(page.getByText('Google Drive no está conectado')).toBeVisible();
  await page.waitForTimeout(500);
  expect(oauthStartCalls).toEqual([]);
});
