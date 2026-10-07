import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('retired plan authoring rejects creation and keeps historical links read-only', async ({ page }) => {
  test.skip(process.env.E2E_BASE_URL !== 'http://localhost:8001', 'Isolated synthetic E2E only');
  const number = String(20000000 + Math.floor(Math.random() * 60000000));
  let sum = 0;
  for (let i = 0; i < number.length; i++) sum += Number(number[number.length - 1 - i]) * (2 + i % 6);
  const check = 11 - sum % 11;
  const response = await page.request.post('/api/patients', { data: {
    first_name: 'Sintética', last_name: `Historial ${randomUUID().slice(0, 8)}`,
    rut: `${number}-${check === 11 ? '0' : check === 10 ? 'K' : check}`,
  }});
  expect(response.status()).toBe(201);
  const patientId = (await response.json()).id;
  const planId = randomUUID();
  const base = `/api/patients/${patientId}/clinical-plans`;
  const before = await (await page.request.get(base)).json();
  expect((await page.request.post(base, { data: {
    id: planId, operation_id: randomUUID(), expected_revision: 0, title: 'Retirado',
  }})).status()).toBe(410);
  expect(await (await page.request.get(base)).json()).toEqual(before);

  // Browser presentation fixture only; PostgreSQL tests prove retained historical rows.
  const now = '2026-10-07T12:00:00Z';
  await page.route(`**${base}/${planId}`, route => route.fulfill({ json: {
    id: planId, patient_id: patientId, title: 'Plan histórico', diagnosis: 'Evidencia conservada',
    state: 'closed', revision: 2, items: [], created_at: now, updated_at: now,
  }}));
  await page.route(`**${base}/${planId}/revisions*`, route => route.fulfill({ json: {
    items: [{ id: randomUUID(), revision: 2, action: 'close', before: null, after: { revision: 2, diagnosis: 'Historia conservada' },
      reason: 'Historia conservada', actor: { user_id: randomUUID(), display_name: null }, changed_at: now }],
    total: 1, next_cursor: null,
  }}));
  const writes: string[] = [];
  page.on('request', request => { if (request.url().includes('/clinical-plans') && request.method() !== 'GET') writes.push(request.method()); });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/patients/${patientId}?tab=clinical&clinical=planning&plan=${planId}`);
    await expect(page.getByRole('heading', { name: 'Historial de plan clínico' })).toBeVisible();
    await expect(page.getByText('Plan histórico', { exact: true })).toBeVisible();
    await expect(page.getByText('Historia conservada', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Crear borrador|Añadir procedimiento|Confirmar plan/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.reload();
  await expect(page.getByText('Plan histórico', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
