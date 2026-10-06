// Baseline investigation only. Requires an owned disposable app at localhost:8001.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium, expect } = createRequire(path.resolve(__dirname, '../../../app/frontend/package.json'))('@playwright/test');

async function main() {
  assert.equal(process.env.ODONTOGRAM_BASELINE_DISPOSABLE, '1', 'Explicit disposable target acknowledgement required');
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:8001', viewport: { width: 1280, height: 800 } });
  const output = { baseline: '4c34e6a', layers: ['BROWSER', 'HTTP', 'real Postgres persistence'], measurements: [], races: [], navigation: {} };
  try {
    const api = context.request;
    const email = `scope-${randomUUID()}@example.com`;
    const password = randomUUID() + 'A1!';
    assert.equal((await api.post('/api/auth/signup', { data: { email, password } })).status(), 201);
    assert.equal((await api.post('/api/auth/login', { data: { email, password } })).status(), 200);
    const patients = [];
    for (const rut of ['12345678-5', '87654321-4']) {
      const response = await api.post('/api/patients', { data: { first_name: 'Synthetic', last_name: 'Scope lock', rut } });
      assert.equal(response.status(), 201);
      patients.push((await response.json()).id);
    }
    const base = `/api/patients/${patients[0]}/conditions`;
    const catalog = await (await api.get('/api/patients/condition-catalog')).json();
    output.catalog = catalog;
    assert.equal(catalog.conditions.length, 12);
    const id = randomUUID();
    const created = await api.post(base, { data: { id, dentition: 'permanent', tooth_fdi: 16, condition_code: 'caries', surfaces: ['M'], note: 'Base' } });
    assert.equal(created.status(), 201);
    const page = await context.newPage();
    await page.goto(`/patients/${patients[0]}?tab=clinical`);
    await expect(page.getByText('Cargando condiciones…')).toBeHidden();
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    await page.getByLabel('Seleccionar pieza FDI').selectOption('16');
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { name: 'Odontograma FDI' })).toBeVisible();
      await page.waitForTimeout(400); // Existing shell resize motion must settle before measurement.
      output.measurements.push(await page.evaluate(() => {
        const chart = document.querySelector('[aria-label="Odontograma"]');
        const buttons = [...chart.querySelectorAll('button')].filter(el => el.getBoundingClientRect().width && getComputedStyle(el).visibility !== 'hidden');
        return { viewport: [innerWidth, innerHeight], chartWidth: chart.getBoundingClientRect().width, visiblePieceControls: buttons.length,
          duplicatedPieceSelectors: ['chart-tooth', 'condition-tooth'].filter(id => !!document.getElementById(id)).length,
          previewHeight: document.querySelector('[aria-label="Pieza seleccionada 16"]').getBoundingClientRect().height,
          pageOverflow: document.documentElement.scrollWidth > innerWidth };
      }));
      assert.equal(output.measurements.at(-1).visiblePieceControls, 0);
      await page.getByRole('complementary', { name: 'Editor de condición' }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(__dirname, `execution-baseline-${viewport.width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Cancelar condición' }).click();
    await page.getByRole('button', { name: 'Descartar condición' }).click();
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const kind of ['disjoint', 'same-field']) {
      const current = await (await api.get(`${base}/${id}`)).json();
      const second = await context.newPage();
      await second.goto(`/patients/${patients[0]}?tab=clinical`);
      await expect(second.getByText('Cargando condiciones…')).toBeHidden();
      await second.getByRole('button', { name: 'Editar condición', exact: true }).click();
      await second.getByLabel('Nota de condición').fill(`Local ${kind}`);
      await page.reload();
      await expect(page.getByText('Cargando condiciones…')).toBeHidden();
      await page.getByRole('button', { name: 'Editar condición', exact: true }).click();
      if (kind === 'disjoint') {
        await page.getByRole('checkbox', { name: 'Oclusal (O)' }).check();
      } else await page.getByLabel('Nota de condición').fill('Remote same-field');
      await page.getByRole('button', { name: 'Guardar condición', exact: true }).click();
      await expect(page.getByLabel('Nota de condición')).toBeHidden();
      const remote = await (await api.get(`${base}/${id}`)).json();
      await second.getByRole('button', { name: 'Guardar condición', exact: true }).click();
      await expect(second.getByText(`Versión actual: ${remote.revision}`, { exact: true })).toBeVisible();
      await expect(second.getByLabel('Nota de condición')).toHaveValue(`Local ${kind}`);
      await second.getByRole('button', { name: 'Rebasar mis cambios' }).click();
      await second.getByRole('button', { name: 'Guardar condición', exact: true }).click();
      await expect(second.getByLabel('Nota de condición')).toBeHidden();
      const result = await (await api.get(`${base}/${id}`)).json();
      assert.equal(result.note, `Local ${kind}`);
      if (kind === 'disjoint') { assert.deepEqual(remote.surfaces, ['M', 'O']); assert.deepEqual(result.surfaces, ['M']); }
      output.races.push({ kind, base: { revision: current.revision, surfaces: current.surfaces, note: current.note }, remote: { revision: remote.revision, surfaces: remote.surfaces, note: remote.note }, result: { revision: result.revision, surfaces: result.surfaces, note: result.note } });
      await second.close();
    }
    await page.goto(`/patients/${patients[0]}`);
    await page.getByRole('tab', { name: 'Clínica', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Diagnóstico manual' })).toBeVisible();
    output.navigation.bareAfterClinical = new URL(page.url()).search;
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Resumen', exact: true })).toHaveAttribute('aria-selected', 'true');
    output.navigation.reloadSection = 'summary';
    await page.goto(`/patients/${patients[0]}?tab=clinical`);
    await page.getByRole('main').getByRole('link', { name: 'Pacientes', exact: true }).click();
    await page.locator(`a[href="/patients/${patients[1]}"]`).first().click();
    await page.getByRole('tab', { name: 'Clínica', exact: true }).click();
    await expect(page.getByText('Cargando condiciones…')).toBeHidden();
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    await page.getByLabel('Seleccionar pieza FDI').selectOption('26');
    await page.getByLabel('Nota de condición').fill('Unsaved navigation fixture');
    await page.evaluate(() => history.back());
    await expect(page.getByRole('dialog', { name: 'Condición sin guardar' })).toBeVisible();
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page.getByLabel('Nota de condición')).toHaveValue('Unsaved navigation fixture');
    assert.equal(new URL(page.url()).pathname, `/patients/${patients[1]}`);
    output.navigation.backCanceled = true;
    await page.evaluate(() => history.back());
    await page.getByRole('button', { name: 'Descartar condición' }).click();
    await expect(page).toHaveURL(/\/patients\/?$/);
    output.navigation.backAccepted = true;
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(new RegExp(patients[0]));
    await expect(page.getByText('Cargando condiciones…')).toBeHidden();
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    await page.evaluate(() => history.forward());
    await expect(page.getByRole('dialog', { name: 'Condición sin guardar' })).toBeVisible();
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    assert.equal(new URL(page.url()).pathname, `/patients/${patients[0]}`);
    output.navigation.forwardCanceled = true;
    await page.evaluate(() => history.forward());
    await page.getByRole('button', { name: 'Descartar condición' }).click();
    await expect(page).toHaveURL(/\/patients\/?$/);
    output.navigation.forwardAccepted = true;
    await page.locator(`a[href="/patients/${patients[1]}"]`).first().click();
    await page.getByRole('tab', { name: 'Clínica', exact: true }).click();
    await expect(page.getByText('Cargando condiciones…')).toBeHidden();
    await page.getByRole('button', { name: 'Caries', exact: true }).click();
    await page.getByRole('main').getByRole('link', { name: 'Pacientes', exact: true }).click();
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page.getByLabel('Nota de condición')).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'Pacientes', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar condición' }).click();
    await page.locator(`a[href="/patients/${patients[0]}"]`).first().click();
    output.navigation.guardedPatientSwitch = true;
    output.navigation.finalConditionCount = (await (await api.get(base)).json()).total;
    assert.equal(output.navigation.finalConditionCount, 1);
    output.revisions = (await (await api.get(`${base}/${id}/revisions`)).json()).items.map(item => ({ id: item.id, revision: item.revision, action: item.action }));
    output.activity = (await (await api.get(`/api/patients/${patients[0]}/activity`)).json()).items;
    assert.deepEqual(new Set(output.revisions.map(item => item.id)), new Set(output.activity.map(item => item.event_id)));
    fs.writeFileSync(path.join(__dirname, 'execution-baseline.json'), JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify({ measurements: output.measurements, races: output.races, navigation: output.navigation, revisionIdsReconciled: output.revisions.length }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
