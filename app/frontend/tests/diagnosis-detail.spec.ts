import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('detail polish: stored pages, declared author, layout, pointer and keyboard previews', async ({ page }) => {
  test.skip(process.env.E2E_BASE_URL !== 'http://localhost:8001', 'Isolated synthetic E2E only');
  const number = String(20000000 + Math.floor(Math.random() * 60000000));
  let sum = 0;
  for (let i = 0; i < number.length; i++) sum += Number(number[number.length - 1 - i]) * (2 + i % 6);
  const check = 11 - sum % 11;
  const response = await page.request.post('/api/patients', { data: {
    first_name: 'Sintética', last_name: `Detalle ${randomUUID().slice(0, 8)}`,
    rut: `${number}-${check === 11 ? '0' : check === 10 ? 'K' : check}`,
    birth_date: '1980-01-10',
  }});
  expect(response.status()).toBe(201);
  const patient = (await response.json()).id;
  const base = `/api/patients/${patient}/conditions`;
  const previousName = (await (await page.request.get('/api/auth/me')).json()).professional_display_name;
  try {
    await page.goto(`/patients/${patient}?tab=clinical`);
    const menu = page.getByRole('button', { name: /Abrir menú de usuario/ });
    await menu.click();
    await page.getByRole('menuitem', { name: 'Perfil profesional' }).click();
    await page.getByRole('textbox', { name: 'Nombre profesional' }).fill('Dra. Sintética Detalle');
    await page.getByRole('button', { name: 'Guardar nombre' }).click();
    await expect(page.getByRole('dialog', { name: 'Perfil profesional' })).toBeHidden();
    await expect(menu).toBeFocused();
    expect((await (await page.request.get('/api/auth/me')).json()).professional_display_name).toBe('Dra. Sintética Detalle');
    // Spread 51 records over 32 teeth to force pagination without crowding the chart.
    const teeth = [1, 2, 3, 4].flatMap(quadrant => Array.from({ length: 8 }, (_, index) => quadrant * 10 + index + 1));
    for (let i = 0; i < 51; i++) {
      const created = await page.request.post(base, { data: {
        id: randomUUID(), dentition: 'permanent', tooth_fdi: teeth[i % teeth.length],
        condition_code: 'caries', surfaces: [i < teeth.length ? 'M' : 'D'],
      }});
      expect(created.status()).toBe(201);
    }
    const firstPage = await (await page.request.get(`${base}?limit=50&status=active`)).json();
    expect(firstPage.total).toBe(51);
    expect(firstPage.next_cursor).toBeTruthy();
    await page.reload();
    await expect(page.getByLabel('51 registros guardados en esta dentición y estado')).toBeVisible();
    await expect(page.getByText('Dra. Sintética Detalle').first()).toBeVisible();
    const writes: string[] = [];
    page.on('request', request => { if (request.url().includes(base) && request.method() !== 'GET') writes.push(request.method()); });
    const catalogue = await (await page.request.get('/api/patients/treatment-catalog')).json();
    expect(catalogue.findings.length + catalogue.variants.length).toBe(75);
    expect(catalogue.categories).toHaveLength(8);
    const tool = page.getByRole('button', { name: 'Caries', exact: true });
    await tool.click();
    await expect(page.getByRole('status', { name: 'Herramienta activa: Caries' })).toBeVisible();
    const tooth = page.getByRole('button', { name: /^Pieza 15:/ });
    await tooth.hover();
    const preview = page.locator('[data-arch-tooth="15"] [data-preview-tool="caries"]');
    await expect(preview).toHaveCount(1);
    await expect(preview.locator('path').first()).toBeVisible();
    expect(await preview.evaluate(element => getComputedStyle(element).animationDuration)).toBe('1s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await tooth.focus();
    expect(await preview.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await page.getByRole('button', { name: 'Cancelar herramienta' }).click();
    await expect(page.getByRole('status', { name: 'Herramienta activa: Caries' })).toHaveCount(0);
    expect(writes).toEqual([]);
    for (const width of [1745, 993, 390]) {
      await page.setViewportSize({ width, height: 982 });
      await page.getByRole('heading', { name: 'Diagnóstico manual' }).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1745) {
        const diagnosis = (await page.getByRole('heading', { name: 'Diagnóstico manual' }).boundingBox())!;
        const notes = (await page.getByRole('heading', { name: 'Notas', exact: true }).boundingBox())!;
        expect(Math.abs(diagnosis.y - notes.y)).toBeLessThan(4);
      }
      await page.screenshot({ path: test.info().outputPath(`detail-${width}.png`) });
    }
  } finally {
    expect((await page.request.patch('/api/auth/me/profile', { data: { professional_display_name: previousName ?? null } })).ok()).toBe(true);
  }
});

test.describe('touch emulation', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  test('tooth inspection and cancellation restore focus without clinical writes', async ({ page }) => {
    // Reuse a patient presentation fixture; no real patient mutation.
    const patient = randomUUID();
    const writes: string[] = [];
    page.on('request', request => {
      if (request.url().includes(`/api/patients/${patient}/`) && request.method() !== 'GET') writes.push(request.method());
    });
    await page.route(`**/api/patients/${patient}`, route => route.fulfill({ json: { id: patient, first_name: 'Sintética', last_name: 'Táctil', rut_masked: '••.•••.111-1', birth_date: null } }));
    await page.route(`**/api/patients/${patient}/**`, route => route.fulfill({ json: { items: [], total: 0, next_cursor: null } }));
    await page.goto(`/patients/${patient}?tab=clinical`);
    await page.getByRole('button', { name: 'Superior derecha', exact: true }).tap();
    const tooth = page.getByRole('button', { name: /^Seleccionar pieza 16:/ });
    await tooth.tap();
    await expect(page.getByRole('dialog', { name: 'Pieza 16', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tooth).toBeFocused();
    expect((await tooth.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Notas', exact: true }).tap();
    await page.getByRole('textbox', { name: 'Texto de nota clínica' }).fill('Borrador táctil');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).tap();
    await page.getByRole('button', { name: 'Añadir nota', exact: true }).tap();
    await expect(page.getByRole('textbox', { name: 'Texto de nota clínica' })).toHaveValue('');
    expect(writes).toEqual([]);
  });
});
