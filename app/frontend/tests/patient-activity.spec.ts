import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { type Page, expect, test } from '@playwright/test';

async function syntheticPatient(page: Page): Promise<string> {
  const digits = String(20000000 + Math.floor(Math.random() * 60000000));
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * (2 + i % 6);
  const check = 11 - sum % 11;
  const created = await page.request.post('/api/patients', { data: {
    first_name: 'Sintética', last_name: `Actividad ${randomUUID().slice(0, 8)}`,
    rut: `${digits}-${check === 11 ? '0' : check === 10 ? 'K' : check}`,
  } });
  expect(created.status()).toBe(201);
  return (await created.json()).id;
}

test.use({ hasTouch: true });
test('slice7 persisted activity pages, filters, errors and exact deep links', async ({ page }) => {
  test.skip(process.env.E2E_BASE_URL !== 'http://localhost:8001', 'Isolated E2E only');
  const patient = await syntheticPatient(page);
  const base = `/api/patients/${patient}`;
  const note = randomUUID();
  expect((await page.request.post(`${base}/notes`, { data: { id: note, body: 'Nota sintética objetivo' } })).status()).toBe(201);
  expect((await page.request.patch(`${base}/notes/${note}`, { data: { expected_revision: 1, body: 'Última versión sintética' } })).status()).toBe(200);
  for (let i = 0; i < 21; i++) {
    expect((await page.request.post(`${base}/notes`, { data: { id: randomUUID(), body: `Nota sintética ${i}` } })).status()).toBe(201);
  }
  const condition = randomUUID();
  expect((await page.request.post(`${base}/conditions`, { data: { id: condition, dentition: 'primary', tooth_fdi: 51, condition_code: 'missing' } })).status()).toBe(201);
  expect((await page.request.patch(`${base}/conditions/${condition}`, { data: { expected_revision: 1, status: 'resolved' } })).status()).toBe(200);
  const evolution = randomUUID();
  // Synthetic approved-save fixture through the existing persistence boundary, no model call.
  expect((await page.request.post(`${base}/evolutions`, { data: {
    id: evolution, evolution_at: '2000-01-01T12:00:00Z', raw_note: 'Nota sintética',
    generated_text: 'Hallazgos sintéticos', final_text: 'Evolución sintética aprobada',
  } })).status()).toBe(201);
  await page.goto(`/patients/${patient}?tab=activity`);
  await expect(page.getByText('26 eventos', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Evolución guardada en ficha', exact: true })).toHaveAttribute('href', `/patients/${patient}/evolutions/${evolution}`);
  expect(await page.getByRole('region', { name: 'Actividad del paciente' }).textContent()).not.toContain('Última versión sintética');
  const out = path.resolve('../../.playwright-cli'); fs.mkdirSync(out, { recursive: true });
  for (const width of [1440, 1024, 375, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 768 });
    await page.getByRole('heading', { name: 'Actividad del paciente' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 768) {
      await page.getByRole('link', { name: 'Evolución guardada en ficha', exact: true }).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: path.join(out, `slice7-activity-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(`**${base}/activity?**`, route => route.fulfill({ status: 503, body: '{}' }), { times: 1 });
  await page.getByRole('button', { name: 'Cargar más actividad' }).click();
  await expect(page.getByRole('alert')).toContainText('toda la actividad');
  await expect(page.getByText('Fin de la actividad')).toBeHidden();
  await page.getByRole('alert').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'slice7-page-error-1440.png') });
  await page.getByRole('button', { name: 'Reintentar actividad' }).click();
  await expect(page.getByText('Fin de la actividad')).toBeVisible();
  await expect(page.locator(`a[href="/patients/${patient}?tab=info&note=${note}"]`)).toHaveCount(2);
  await page.locator(`a[href="/patients/${patient}?tab=info&note=${note}"]`).first().click();
  await expect(page.getByRole('article', { name: 'Nota · revisión 2' })).toBeFocused();
  await expect(page.getByText('Última versión sintética', { exact: true })).toBeVisible();
  await page.getByRole('article', { name: 'Nota · revisión 2' }).getByRole('button', { name: 'Historial de nota' }).click();
  await expect(page.getByText('Revisión 1 · Creada', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Actividad', exact: true }).click();
  await page.getByRole('button', { name: 'Diagnósticos', exact: true }).click();
  await expect(page.getByText('2 eventos', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Condición resuelta · Pieza 51', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Pieza 51 · Ausente · Resuelta' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Temporal', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Actividad', exact: true }).click();
  await page.getByRole('button', { name: 'Evoluciones', exact: true }).click();
  await expect(page.getByText('1 evento', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Evolución guardada en ficha', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/evolutions/${evolution}$`));
  await expect(page.getByLabel('Detalle de la evolución').getByText('Evolución sintética aprobada', { exact: true })).toBeVisible();
  // Source failure is distinct from a genuine empty category.
  await page.route(`**${base}/activity?**`, route => route.fulfill({ status: 503, body: '{}' }), { times: 1 });
  await page.goto(`/patients/${patient}?tab=activity`);
  await expect(page.getByRole('alert')).toContainText('No pudimos cargar la actividad');
  await page.getByRole('button', { name: 'Reintentar actividad' }).click();
  await expect(page.getByText('26 eventos', { exact: true })).toBeVisible();
  await page.route(`**${base}/activity?**`, route => route.fulfill({ json: { items: [], total: 0, next_cursor: null } }), { times: 1 });
  await page.getByRole('button', { name: 'Notas', exact: true }).click();
  await expect(page.getByText('Sin eventos en esta categoría')).toBeVisible();
  await page.screenshot({ path: path.join(out, 'slice7-filter-empty-1440.png') });
  await page.getByRole('button', { name: 'Mostrar todo' }).click();
  await expect(page.getByText('26 eventos', { exact: true })).toBeVisible();
});

test('slice8 real manual saves, chart, activity, keyboard/privacy and Assistant draft continuity', async ({ page }) => {
  test.skip(process.env.E2E_BASE_URL !== 'http://localhost:8001', 'Isolated E2E only');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const patient = await syntheticPatient(page);
  const base = `/api/patients/${patient}`;
  await page.goto(`/patients/${patient}`);
  const summary = page.getByRole('tab', { name: 'Resumen', exact: true });
  await summary.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Información', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Nueva nota' }).click();
  await page.getByLabel('Nota general').fill('Borrador sintético protegido');
  await page.getByRole('button', { name: 'Asistente', exact: true }).click();
  await expect(page.getByLabel('Nota general')).toHaveValue('Borrador sintético protegido');
  await page.getByRole('button', { name: 'Cerrar asistente' }).click();
  await page.getByRole('tab', { name: 'Actividad', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nota sin guardar' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir editando' }).click();
  expect((await (await page.request.get(`${base}/notes`)).json()).total).toBe(0);
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Nota · revisión 1' })).toContainText('Borrador sintético protegido');
  const note = (await (await page.request.get(`${base}/notes`)).json()).items[0].id;
  await page.getByRole('tab', { name: 'Clínica', exact: true }).click();
  await expect(page.getByText('Cargando condiciones…')).toBeHidden();
  await page.getByRole('button', { name: 'Caries', exact: true }).click();
  await page.getByRole('button', { name: /^Pieza 36:/ }).click();
  const surfaces = page.getByRole('dialog', { name: 'Seleccionar superficies' });
  await surfaces.getByRole('checkbox', { name: 'Mesial (M)' }).check();
  expect((await (await page.request.get(`${base}/conditions`)).json()).total).toBe(0);
  await surfaces.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Pieza 36 · Caries · Activa' })).toBeVisible();
  await page.getByRole('tab', { name: 'Actividad', exact: true }).click();
  await expect(page.getByText('2 eventos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notas', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Notas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 evento', { exact: true })).toBeVisible();
  const activity = page.getByRole('region', { name: 'Actividad del paciente' });
  expect(await activity.textContent()).not.toContain('Borrador sintético protegido');
  const out = path.resolve('../../.playwright-cli');
  fs.writeFileSync(path.join(out, 'slice8-activity.aria.yml'), await activity.ariaSnapshot());
  await page.setViewportSize({ width: 320, height: 667 });
  await activity.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  for (const button of await activity.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: path.join(out, 'slice8-activity-320.png') });
  await page.getByRole('link', { name: 'Nota creada', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`note=${note}$`));
  await expect(page.getByRole('article', { name: 'Nota · revisión 1' })).toBeFocused();
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, state: history.state }));
  expect(stored).not.toContain('Borrador sintético protegido');
  expect(stored).not.toContain('Condición sintética integrada');
  expect(page.url()).not.toContain('protegido');
});
