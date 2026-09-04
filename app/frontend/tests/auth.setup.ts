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
