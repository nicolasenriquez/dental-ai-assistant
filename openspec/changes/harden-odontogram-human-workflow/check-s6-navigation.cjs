// S6 safe navigation continuity. Requires the owned disposable app at localhost:8001.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium, expect } = createRequire(path.resolve(__dirname, '../../../app/frontend/package.json'))('@playwright/test');

async function main() {
  assert.equal(process.env.ODONTOGRAM_S6_DISPOSABLE, '1', 'Explicit disposable target acknowledgement required');
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:8001', viewport: { width: 1280, height: 800 } });
  const output = {
    layers: ['BROWSER', 'HTTP', 'real Postgres persistence'],
    bareFicha: {},
    reload: {},
    dirtyGuard: {},
    backForward: {},
    deepLink: {},
    patientSwitch: {},
    invalidEnum: {},
    urlPrivacy: {},
  };
  try {
    const api = context.request;
    const email = `s6-${randomUUID()}@example.com`;
    const password = randomUUID() + 'A1!';
    assert.equal((await api.post('/api/auth/signup', { data: { email, password } })).status(), 201);
    assert.equal((await api.post('/api/auth/login', { data: { email, password } })).status(), 200);
    const patientResponse = await api.post('/api/patients', {
      data: { first_name: 'Synthetic', last_name: 'Navigation S6', rut: '12345678-5' },
    });
    assert.equal(patientResponse.status(), 201);
    const patientId = (await patientResponse.json()).id;
    const conditionsBase = `/api/patients/${patientId}/conditions`;
    const createResponse = await api.post(conditionsBase, {
      data: { id: randomUUID(), dentition: 'permanent', tooth_fdi: 16, condition_code: 'caries', surfaces: ['O'], note: 'Base16' },
    });
    assert.equal(createResponse.status(), 201);
    const condition = await createResponse.json();
    const countConditions = async () =>
      (await (await api.get(`${conditionsBase}?status=all`)).json()).items.length;

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    const editor = page.getByRole('complementary', { name: 'Editor de condición' });

    // 1. Bare ficha keeps a clean URL; Clínica writes the canonical pair.
    await page.goto(`/patients/${patientId}`);
    await expect(page.getByText('Cargando condiciones…')).toBeHidden().catch(() => {});
    await expect(page.getByRole('region', { name: 'Resumen del paciente' })).toBeVisible();
    assert.equal(new URL(page.url()).search, '', 'bare ficha has no query');
    await page.getByRole('tab', { name: 'Clínica' }).click();
    await expect(page.getByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    assert.match(page.url(), /tab=clinical/);
    assert.match(page.url(), /clinical=diagnosis/);
    output.bareFicha = { url: new URL(page.url()).pathname + new URL(page.url()).search };

    // 2. Reload restores diagnosis, not Resumen.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    assert.equal(await page.getByRole('region', { name: 'Resumen del paciente' }).count(), 0);
    output.reload = { restored: 'diagnosis' };
    await page.screenshot({ path: path.join(__dirname, 's6-reload-diagnosis.png'), fullPage: true });

    // 3. Dirty draft: canceled navigation restores URL/draft; accepted discard navigates without writing.
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    await page.getByLabel('Seleccionar pieza FDI').selectOption('36');
    await page.getByLabel('Nota de condición').fill('Borrador privado S6');
    await page.getByRole('button', { name: 'Evoluciones' }).click();
    await expect(page.getByRole('dialog', { name: 'Condición sin guardar' })).toBeVisible();
    await page.screenshot({ path: path.join(__dirname, 's6-dirty-guard.png'), fullPage: true });
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    assert.match(page.url(), /clinical=diagnosis/);
    await expect(page.getByLabel('Nota de condición')).toHaveValue('Borrador privado S6');
    const beforeDiscard = await countConditions();
    await page.getByRole('button', { name: 'Evoluciones' }).click();
    await page.getByRole('dialog', { name: 'Condición sin guardar' }).getByRole('button', { name: 'Descartar condición' }).click();
    await expect(page.getByRole('heading', { name: 'Historial de evoluciones' })).toBeVisible();
    assert.match(page.url(), /clinical=evolutions/);
    assert.equal(await countConditions(), beforeDiscard, 'discard writes nothing');
    output.dirtyGuard = { canceled: 'diagnosis', accepted: 'evolutions', writes: 0 };

    // 4. Focused historical condition deep link; URL carries only the UUID.
    await page.goto(`/patients/${patientId}?tab=clinical&clinical=diagnosis&condition=${condition.id}`);
    await expect(page.getByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Pieza 16 · Caries · Activa' })).toBeVisible();
    assert.match(page.url(), new RegExp(`condition=${condition.id}`));
    output.deepLink = { condition: condition.id, url: page.url() };

    // 5. Back/forward restore the prior committed URL/UI.
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Historial de evoluciones' })).toBeVisible();
    assert.match(page.url(), /clinical=evolutions/);
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Pieza 16 · Caries · Activa' })).toBeVisible();
    assert.match(page.url(), new RegExp(`condition=${condition.id}`));
    output.backForward = { back: 'evolutions', forward: 'diagnosis+condition' };

    // 6. Dirty patient switch through the directory link keeps the guard.
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    await page.getByLabel('Seleccionar pieza FDI').selectOption('26');
    await page.getByLabel('Nota de condición').fill('Segundo borrador');
    await page.getByLabel('Navegación principal').getByRole('link', { name: 'Pacientes' }).click();
    await expect(page.getByRole('dialog', { name: 'Condición sin guardar' })).toBeVisible();
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    assert.match(page.url(), new RegExp(`/patients/${patientId}`));
    await expect(page.getByLabel('Nota de condición')).toHaveValue('Segundo borrador');
    const beforeSwitch = await countConditions();
    await page.getByLabel('Navegación principal').getByRole('link', { name: 'Pacientes' }).click();
    await page.getByRole('dialog', { name: 'Condición sin guardar' }).getByRole('button', { name: 'Descartar condición' }).click();
    await expect(page).toHaveURL(/\/patients$/);
    assert.equal(await countConditions(), beforeSwitch, 'patient switch writes nothing');
    output.patientSwitch = { canceled: true, accepted: true, writes: 0 };

    // 7. Invalid enums default deterministically without fetching the malformed UUID.
    await page.goto(`/patients/${patientId}?tab=clinical&clinical=weird&condition=not-a-uuid`);
    await expect(page.getByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    await expect(page.getByText('No se encontró esta condición')).toBeVisible();
    assert.equal(await page.getByRole('region', { name: 'Resumen del paciente' }).count(), 0);
    output.invalidEnum = { tab: 'clinical', clinical: 'weird', fallback: 'diagnosis' };

    // 8. URL privacy: no clinical text, patient name or RUT anywhere in the URL.
    const urls = [];
    for (const state of ['summary', 'clinical', 'clinicalDirty']) {
      if (state === 'summary') await page.goto(`/patients/${patientId}`);
      if (state === 'clinical') await page.goto(`/patients/${patientId}?tab=clinical&clinical=diagnosis`);
      if (state === 'clinicalDirty') {
        await page.getByRole('button', { name: 'Caries', exact: true }).click();
        await page.getByLabel('Nota de condición').fill('Texto clínico secreto');
      }
      urls.push(page.url());
    }
    for (const url of urls) {
      assert.equal(url.includes('Synthetic'), false, 'no patient name in URL');
      assert.equal(url.includes('Navigation'), false, 'no patient surname in URL');
      assert.equal(url.includes('12345678'), false, 'no RUT in URL');
      assert.equal(url.includes('Borrador'), false, 'no note text in URL');
      assert.equal(url.includes('secreto'), false, 'no clinical text in URL');
    }
    output.urlPrivacy = { checkedUrls: urls.length, leaked: false };

    output.pageErrors = pageErrors;
    assert.deepEqual(pageErrors, [], 'zero page errors');
    fs.writeFileSync(path.join(__dirname, 's6-browser.json'), JSON.stringify(output, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
