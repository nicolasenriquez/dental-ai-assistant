// Requires the owned disposable S2 app on localhost:8001; never targets shared data.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium, expect } = createRequire(path.resolve(__dirname, '../../../app/frontend/package.json'))('@playwright/test');

async function main() {
  assert.equal(process.env.ODONTOGRAM_S2_DISPOSABLE, '1', 'Disposable target acknowledgement required');
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:8001', viewport: { width: 1280, height: 800 } });
  const output = { baseline: '37402de', cases: [], receipts: [], revisions: [], pageErrors: [] };
  try {
    const api = context.request;
    const email = `s2-${randomUUID()}@example.com`;
    const password = randomUUID() + 'A1!';
    assert.equal((await api.post('/api/auth/signup', { data: { email, password } })).status(), 201);
    assert.equal((await api.post('/api/auth/login', { data: { email, password } })).status(), 200);
    const patientResponse = await api.post('/api/patients', { data: { first_name: 'Synthetic', last_name: 'S2 correction', rut: '12345678-5' } });
    assert.equal(patientResponse.status(), 201);
    const patient = await patientResponse.json();
    output.patientId = patient.id;
    const base = `/api/patients/${patient.id}/conditions`;
    const page = await context.newPage();
    page.on('pageerror', error => output.pageErrors.push(error.message));
    const writes = [];
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/corrections')) writes.push(request.postDataJSON());
    });
    const create = async (tooth) => {
      const response = await api.post(base, { data: { id: randomUUID(), dentition: 'permanent', tooth_fdi: tooth, condition_code: 'caries', surfaces: ['O'], note: 'Synthetic original' } });
      assert.equal(response.status(), 201);
      return response.json();
    };
    const open = async (source) => {
      await page.goto(`/patients/${patient.id}?tab=clinical&condition=${source.id}`);
      await expect(page.getByText('Cargando condiciones…')).toBeHidden();
      await page.getByRole('article', { name: `Pieza ${source.tooth_fdi} · Caries · ${source.status === 'resolved' ? 'Resuelta' : 'Activa'}`, exact: true }).getByRole('button', { name: 'Corregir registro' }).click();
      await expect(page.getByLabel('Motivo de corrección')).toBeFocused();
      await page.getByLabel('Motivo de corrección').fill('Se registró en una pieza equivocada.');
    };
    const source = await create(16);
    await open(source);
    await page.getByRole('button', { name: 'Revisar corrección', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Revisar corrección' })).toContainText('Synthetic S2 correction');
    await page.getByRole('button', { name: 'Volver al borrador' }).click();
    await page.getByRole('button', { name: 'Cancelar condición' }).click();
    await page.getByRole('button', { name: 'Descartar condición' }).click();
    assert.equal(writes.length, 0);
    assert.equal((await (await api.get(`${base}/${source.id}`)).json()).revision, 1);
    output.cases.push('review/cancel: zero writes and unchanged revision');

    await open(source);
    await page.getByRole('checkbox', { name: 'Crear registro de reemplazo' }).check();
    await page.getByLabel('Pieza FDI', { exact: true }).selectOption('26');
    await page.getByLabel('Nota de condición').fill('Reviewed replacement snapshot');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Revisar corrección', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Revisar corrección' });
    await expect(review).toContainText('Reemplazo nuevo: Pieza 26');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(__dirname, 's2-review-390.png'), fullPage: true });
    await page.getByRole('button', { name: 'Volver al borrador' }).click();
    await page.getByLabel('Motivo de corrección').fill('Se registró en una pieza equivocada. ' + 'Detalle '.repeat(110));
    await page.getByRole('button', { name: 'Revisar corrección', exact: true }).click();
    const bounds = await review.boundingBox();
    assert.ok(bounds.y >= 15 && bounds.y + bounds.height <= 829, 'Long review fits mobile viewport');
    const saveAction = page.getByRole('button', { name: 'Guardar corrección', exact: true });
    await saveAction.scrollIntoViewIfNeeded();
    assert.ok((await saveAction.boundingBox()).height >= 44);
    await page.screenshot({ path: path.join(__dirname, 's2-long-review-390.png'), fullPage: true });
    output.cases.push('long correction review stays within mobile viewport with scroll-reachable 44px save');
    let firstReceipt;
    let interrupted = false;
    await page.route('**/corrections', async route => {
      if (interrupted) return route.continue();
      interrupted = true;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      firstReceipt = await response.json();
      await route.abort('failed'); // Server committed; browser receives no authoritative response.
    });
    await page.getByRole('button', { name: 'Guardar corrección', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reintentar corrección' })).toBeVisible();
    await expect(page.getByLabel('Motivo de corrección')).toBeDisabled();
    await expect(page.getByLabel('Nota de condición')).toBeDisabled();
    assert.equal((await (await api.get(`${base}/${source.id}`)).json()).status, 'entered_in_error');
    const retryResponse = page.waitForResponse(response => response.url().endsWith('/corrections') && response.status() === 200);
    await page.getByRole('button', { name: 'Reintentar corrección' }).click();
    const replay = await (await retryResponse).json();
    assert.deepEqual(replay, firstReceipt);
    assert.deepEqual(writes[0], writes[1]);
    await expect(page.getByText('Corrección guardada.', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Revisión exacta del resultado' })).toBeFocused();
    const replacement = await (await api.get(`${base}/${replay.replacement_condition_id}`)).json();
    assert.equal(replacement.tooth_fdi, 26);
    assert.equal(replacement.supersedes_condition_id, source.id);
    assert.equal(replacement.revision, 1);
    output.receipts.push(replay);
    output.cases.push('mobile reviewed replacement; committed response loss; identical 200 retry, one correction/replacement');
    await page.unroute('**/corrections');

    // A later edit must not replace the exact creation snapshot identified by the receipt.
    assert.equal((await api.patch(`${base}/${replacement.id}`, { data: { expected_revision: 1, note: 'Later replacement edit' } })).status(), 200);
    await page.getByRole('button', { name: 'Ver revisión del reemplazo' }).click();
    await expect(page.getByRole('article', { name: 'Revisión exacta del resultado' })).toContainText('Reviewed replacement snapshot');
    await expect(page.getByRole('article', { name: 'Revisión exacta del resultado' })).not.toContainText('Later replacement edit');
    await page.getByRole('button', { name: 'Ver revisión original corregida' }).click();
    await expect(page.getByRole('article', { name: 'Revisión exacta del resultado' })).toContainText('Corregida');
    output.cases.push('exact original/replacement audit links distinguish subsequent replacement edit');

    const resolved = await create(36);
    assert.equal((await api.patch(`${base}/${resolved.id}`, { data: { expected_revision: 1, status: 'resolved' } })).status(), 200);
    resolved.status = 'resolved';
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(resolved);
    await page.getByRole('button', { name: 'Revisar corrección', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Revisar corrección' })).toContainText('Sin registro de reemplazo.');
    await page.screenshot({ path: path.join(__dirname, 's2-review-1280.png'), fullPage: true });
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/corrections') && response.status() === 201);
    await page.route(`**/conditions/${resolved.id}`, async route => {
      if (route.request().method() === 'GET') await route.abort('failed');
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Guardar corrección', exact: true }).click();
    const withoutReplacement = await (await responsePromise).json();
    assert.equal(withoutReplacement.replacement_condition_id, null);
    await expect(page.getByText(/Corrección guardada; no pudimos actualizar el resultado/)).toBeVisible();
    const writesBeforeRead = writes.length;
    await page.unroute(`**/conditions/${resolved.id}`);
    await page.getByRole('button', { name: 'Ver revisión original corregida' }).click();
    await expect(page.getByRole('article', { name: 'Revisión exacta del resultado' })).toBeFocused();
    assert.equal(writes.length, writesBeforeRead);
    output.receipts.push(withoutReplacement);
    output.cases.push('resolved original without replacement; confirmed write/failed GET; GET-only recovery');
    for (const id of [source.id, replacement.id, resolved.id]) {
      const history = await (await api.get(`${base}/${id}/revisions?limit=50`)).json();
      output.revisions.push(...history.items.map(item => ({ id: item.id, condition_id: id, revision: item.revision, action: item.action })));
    }
    assert.equal(output.revisions.length, 7);
    for (const receipt of output.receipts) {
      assert.ok(output.revisions.some(item => item.id === receipt.correction_revision_id && item.action === 'corrected'));
      if (receipt.replacement_revision_id) assert.ok(output.revisions.some(item => item.id === receipt.replacement_revision_id && item.action === 'created'));
    }
    assert.deepEqual(output.pageErrors, []);
    fs.writeFileSync(path.join(__dirname, 's2-browser.json'), JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify(output, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
