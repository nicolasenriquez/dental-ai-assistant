import os from 'node:os';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';

const authStatePath = path.join(os.tmpdir(), 'ai-tutor-playwright', 'auth.json');

setup('authenticate admin user', async ({ page, context }) => {
  const email = process.env.E2E_USER;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_USER and E2E_PASSWORD are required; secrets are never stored in the repo.',
    );
  }

  if (process.env.E2E_BOOTSTRAP_USER === '1') {
    if (setup.info().project.use.baseURL !== 'http://localhost:8001') {
      throw new Error('E2E_BOOTSTRAP_USER is allowed only on the isolated localhost:8001 app.');
    }
    const config = await page.request.get('/api/auth/config');
    expect(config.ok()).toBeTruthy();
    expect((await config.json()).mode).toBe('local');
    const existingLogin = await page.request.post('/api/auth/login', {
      data: { email, password },
    });
    if (existingLogin.status() === 401) {
      const signup = await page.request.post('/api/auth/signup', {
        data: { email, password },
      });
      if (signup.status() !== 201) {
        throw new Error(`E2E signup failed with status ${signup.status()}`);
      }
    } else if (!existingLogin.ok()) {
      throw new Error(`E2E credential check failed with status ${existingLogin.status()}`);
    }
    await page.context().clearCookies();
  }

  await page.clock.install({ time: '2026-01-15T12:00:00Z' });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page).toHaveURL(/\/patients\/?$/);
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();
  await context.storageState({ path: authStatePath });
});
