import { type Page, chromium, expect, test } from '@playwright/test';

test.skip(
  process.env.E2E_PROVIDER_SMOKE !== '1',
  'Set E2E_PROVIDER_SMOKE=1 to run public Google provider smoke coverage.',
);

const smokeClientId = 'browser-smoke.invalid.apps.googleusercontent.com';
const smokePickerAppId = 'browser-smoke-app';
const smokePickerKey = 'browser-smoke-key';
const smokePickerToken = 'browser-smoke-token';

interface GisClient {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
}

interface PickerBuilder {
  setAppId: (value: string) => PickerBuilder;
  setDeveloperKey: (value: string) => PickerBuilder;
  setOAuthToken: (value: string) => PickerBuilder;
  setOrigin: (value: string) => PickerBuilder;
  addView: (value: unknown) => PickerBuilder;
  setCallback: (value: () => void) => PickerBuilder;
  build: () => { setVisible: (value: boolean) => void };
}

interface ProviderSmokeWindow extends Window {
  google?: {
    accounts?: { id?: GisClient };
    picker?: {
      PickerBuilder: new () => PickerBuilder;
      DocsView: new (
        viewId?: unknown,
      ) => {
        setMimeTypes: (value: string) => unknown;
        setIncludeFolders?: (value: boolean) => unknown;
      };
      ViewId?: { DOCS?: unknown };
    };
  };
  gapi?: { load: (name: string, callback: () => void) => void };
  providerSmokeCallback?: (response: { credential?: string }) => void;
}

const observedProviderOrigins = new Set([
  'https://accounts.google.com',
  'https://ssl.gstatic.com',
  'https://apis.google.com',
  'https://docs.google.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
]);

async function runProviderSmoke(page: Page): Promise<void> {
  const requests = new Set<string>();
  const cspViolations: string[] = [];
  page.on('request', (request) => {
    const origin = new URL(request.url()).origin;
    if (origin !== new URL(page.url()).origin) requests.add(origin);
  });
  page.on('console', (message) => {
    if (
      /Content Security Policy|violates the document's Content Security Policy/i.test(
        message.text(),
      )
    ) {
      cspViolations.push(message.text());
    }
  });

  const response = await page.goto('/login', { waitUntil: 'domcontentloaded' });
  expect(response?.headers()['content-security-policy']).toBeTruthy();
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin-allow-popups');

  await page.route('**/api/auth/google', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'GOOGLE_IDENTITY_INVALID' }),
    }),
  );

  await page.addScriptTag({ url: 'https://accounts.google.com/gsi/client' });
  await page.evaluate((clientId) => {
    const smokeWindow = window as ProviderSmokeWindow;
    const gis = smokeWindow.google?.accounts?.id;
    if (!gis) throw new Error('GIS did not load');
    const container = document.createElement('div');
    container.id = 'provider-smoke-gis';
    document.body.append(container);
    smokeWindow.providerSmokeCallback = (response) => {
      if (!response.credential) return;
      void fetch('/api/auth/google', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
    };
    gis.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      callback: smokeWindow.providerSmokeCallback,
      auto_select: false,
      use_fedcm_for_button: false,
      button_auto_select: false,
    });
    gis.renderButton(container, { theme: 'outline', size: 'large', width: '400' });
  }, smokeClientId);

  const credentialRequest = page.waitForRequest(
    (request) => request.url().endsWith('/api/auth/google') && request.method() === 'POST',
  );
  await page.evaluate(() => {
    (window as ProviderSmokeWindow).providerSmokeCallback?.({ credential: 'synthetic-credential' });
  });
  expect((await credentialRequest).postDataJSON()).toEqual({
    credential: 'synthetic-credential',
  });
  await expect(page.locator('#provider-smoke-gis iframe')).toHaveAttribute(
    'src',
    /https:\/\/accounts\.google\.com\/gsi\/button/,
  );

  await page.addScriptTag({ url: 'https://apis.google.com/js/api.js' });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const smokeWindow = window as ProviderSmokeWindow;
        if (!smokeWindow.gapi) throw new Error('Google API loader did not load');
        smokeWindow.gapi.load('picker', resolve);
      }),
  );
  await page.evaluate(
    ({ appId, developerKey, accessToken }) => {
      const picker = (window as ProviderSmokeWindow).google?.picker;
      if (!picker) throw new Error('Picker did not load');
      const view = new picker.DocsView(picker.ViewId?.DOCS);
      view.setMimeTypes('text/plain,text/markdown');
      view.setIncludeFolders?.(false);
      const instance = new picker.PickerBuilder()
        .setAppId(appId)
        .setDeveloperKey(developerKey)
        .setOAuthToken(accessToken)
        .setOrigin(window.location.origin)
        .addView(view)
        .setCallback(() => undefined)
        .build();
      instance.setVisible(true);
    },
    { appId: smokePickerAppId, developerKey: smokePickerKey, accessToken: smokePickerToken },
  );

  await expect.poll(() => requests.has('https://docs.google.com')).toBe(true);
  await expect(page.locator('iframe[src^="https://docs.google.com/picker"]')).toHaveCount(1);
  expect(cspViolations).toEqual([]);
  const externalOrigins = [...requests].filter((origin) => origin !== new URL(page.url()).origin);
  expect(externalOrigins).toEqual(expect.arrayContaining([...observedProviderOrigins]));
  expect(externalOrigins.every((origin) => observedProviderOrigins.has(origin))).toBe(true);
}

test('GIS popup callback and Picker load without CSP violations in both browser modes', async ({
  page,
}) => {
  await runProviderSmoke(page);

  const legacyBrowser = await chromium.launch({ args: ['--disable-features=FedCm'] });
  try {
    const legacyContext = await legacyBrowser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8000',
    });
    try {
      await runProviderSmoke(await legacyContext.newPage());
    } finally {
      await legacyContext.close();
    }
  } finally {
    await legacyBrowser.close();
  }
});
