// S5 deliberate conflict review. Requires the owned disposable app at localhost:8001.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium, expect } = createRequire(path.resolve(__dirname, '../../../app/frontend/package.json'))('@playwright/test');

async function main() {
  assert.equal(process.env.ODONTOGRAM_S5_DISPOSABLE, '1', 'Explicit disposable target acknowledgement required');
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: 'http://localhost:8001', viewport: { width: 1280, height: 800 } });
  const output = {
    layers: ['BROWSER', 'HTTP', 'real Postgres persistence'],
    disjointField: {},
    sameFieldRepeat: {},
    terminalEdit: {},
    correctVsResolve: {},
    terminalCorrect: {},
    failedRead: {},
    finalConditions: null,
  };
  try {
    const api = context.request;
    const email = `s5-${randomUUID()}@example.com`;
    const password = randomUUID() + 'A1!';
    assert.equal((await api.post('/api/auth/signup', { data: { email, password } })).status(), 201);
    assert.equal((await api.post('/api/auth/login', { data: { email, password } })).status(), 200);
    const patientResponse = await api.post('/api/patients', {
      data: { first_name: 'Synthetic', last_name: 'Conflict S5', rut: '12345678-5' },
    });
    assert.equal(patientResponse.status(), 201);
    const patientId = (await patientResponse.json()).id;
    const conditionsBase = `/api/patients/${patientId}/conditions`;
    const createCondition = async (tooth_fdi, note) => {
      const response = await api.post(conditionsBase, {
        data: { id: randomUUID(), dentition: 'permanent', tooth_fdi, condition_code: 'caries', surfaces: ['M'], note },
      });
      assert.equal(response.status(), 201);
      return (await response.json());
    };
    const condition36 = await createCondition(36, 'Base36');
    const condition46 = await createCondition(46, 'Base46');
    const condition11 = await createCondition(11, 'Base11');
    const condition21 = await createCondition(21, 'Base21');
    const readCondition = async (id) => (await api.get(`${conditionsBase}/${id}`)).json();

    const pageA = await context.newPage();
    const pageB = await context.newPage();
    const pageErrors = [];
    for (const page of [pageA, pageB]) page.on('pageerror', (error) => pageErrors.push(String(error)));
    await pageA.goto(`/patients/${patientId}?tab=clinical`);
    await pageB.goto(`/patients/${patientId}?tab=clinical`);
    await expect(pageA.getByText('Cargando condiciones…')).toBeHidden();
    await expect(pageB.getByText('Cargando condiciones…')).toBeHidden();

    const editor = (page) => page.getByRole('complementary', { name: 'Editor de condición' });
    const article = (page, tooth, status = 'Activa') =>
      page.getByRole('article', { name: new RegExp(`Pieza ${tooth} · Caries · ${status}`) });
    const editOn = (page, tooth) =>
      article(page, tooth).getByRole('button', { name: 'Editar condición' }).click();

    // 1. Disjoint-field race: B changes surfaces, A changes only the note.
    await editOn(pageA, 36);
    await pageA.getByLabel('Nota de condición').fill('Nota local A');
    await editOn(pageB, 36);
    await pageB.getByRole('checkbox', { name: 'Oclusal (O)' }).check();
    await editor(pageB).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageB.getByLabel('Nota de condición')).toBeHidden();
    assert.equal((await readCondition(condition36.id)).revision, 2, 'B surfaces commit first');
    await editor(pageA).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageA.getByText('Versión actual: 2')).toBeVisible();
    assert.equal(await pageA.getByRole('button', { name: 'Rebasar mis cambios' }).count(), 0, 'no generic rebase');
    await expect(pageA.getByText('Superficies — Tuyas: M · Actuales: M, O')).toBeVisible();
    await expect(pageA.getByLabel('Nota de condición')).toHaveValue('Nota local A');
    await expect(editor(pageA).getByRole('button', { name: 'Guardar condición' })).toBeEnabled();
    await pageA.screenshot({ path: path.join(__dirname, 's5-disjoint-conflict.png'), fullPage: true });
    await editor(pageA).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageA.getByLabel('Nota de condición')).toBeHidden();
    let current = await readCondition(condition36.id);
    assert.equal(current.revision, 3, 'merged retry commits');
    assert.equal(current.note, 'Nota local A', 'local note retained');
    assert.deepEqual(current.surfaces, ['M', 'O'], 'remote surfaces retained');
    output.disjointField = { revision: current.revision, note: current.note, surfaces: current.surfaces };

    // 2. Same-field race with a second 409 after choices.
    await editOn(pageA, 46);
    await pageA.getByLabel('Nota de condición').fill('Local46');
    await editOn(pageB, 46);
    await pageB.getByLabel('Nota de condición').fill('Remota46');
    await editor(pageB).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageB.getByLabel('Nota de condición')).toBeHidden();
    await editor(pageA).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageA.getByText('Versión actual: 2')).toBeVisible();
    await expect(pageA.getByText('Nota — Tuya: Local46 · Actual: Remota46')).toBeVisible();
    await expect(editor(pageA).getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
    await pageA.screenshot({ path: path.join(__dirname, 's5-samefield-conflict.png'), fullPage: true });
    await editor(pageA).getByRole('button', { name: 'Mantener mi nota' }).click();
    await pageB.reload();
    await expect(pageB.getByText('Cargando condiciones…')).toBeHidden();
    await editOn(pageB, 46);
    await pageB.getByLabel('Nota de condición').fill('Remota46-2');
    await editor(pageB).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageB.getByLabel('Nota de condición')).toBeHidden();
    assert.equal((await readCondition(condition46.id)).revision, 3, 'second remote commit');
    await editor(pageA).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageA.getByText('Versión actual: 3')).toBeVisible();
    await expect(editor(pageA).getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
    await expect(pageA.getByLabel('Nota de condición')).toHaveValue('Local46');
    await pageA.screenshot({ path: path.join(__dirname, 's5-repeat-conflict.png'), fullPage: true });
    await editor(pageA).getByRole('button', { name: 'Mantener mi nota' }).click();
    await editor(pageA).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageA.getByLabel('Nota de condición')).toBeHidden();
    current = await readCondition(condition46.id);
    assert.equal(current.revision, 4, 'reviewed retry commits after second 409');
    assert.equal(current.note, 'Local46', 'local note survives repeated conflict');
    output.sameFieldRepeat = { revision: current.revision, note: current.note };

    // 3. Terminal guard: edit hits a resolved current.
    await pageB.reload();
    await expect(pageB.getByText('Cargando condiciones…')).toBeHidden();
    await article(pageB, 36).getByRole('button', { name: 'Resolver condición' }).click();
    await editor(pageB).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageB.getByLabel('Nota de condición')).toBeHidden();
    assert.equal((await readCondition(condition36.id)).status, 'resolved');
    await editOn(pageA, 36);
    await pageA.getByLabel('Nota de condición').fill('Nunca');
    await editor(pageA).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageA.getByText('Versión actual: 4')).toBeVisible();
    await expect(pageA.getByText(/Este registro ya está resuelto/)).toBeVisible();
    await expect(editor(pageA).getByRole('button', { name: 'Guardar condición' })).toBeDisabled();
    await expect(editor(pageA).getByRole('button', { name: 'Usar versión actual' })).toBeEnabled();
    await pageA.screenshot({ path: path.join(__dirname, 's5-terminal-edit.png'), fullPage: true });
    await editor(pageA).getByRole('button', { name: 'Usar versión actual' }).click();
    await expect(pageA.getByLabel('Nota de condición')).toBeHidden();
    await pageA.getByRole('combobox', { name: 'Estado' }).selectOption('all');
    await expect(article(pageA, 36, 'Resuelta')).toBeVisible();
    output.terminalEdit = { status: 'resolved', revision: (await readCondition(condition36.id)).revision };

    // 4. Correction conflicts with concurrent resolution: D-03 renewed review.
    await article(pageA, 46).getByRole('button', { name: 'Corregir registro' }).click();
    await pageA.getByLabel('Motivo de corrección').fill('Incorrecta');
    await editor(pageA).getByRole('button', { name: 'Revisar corrección' }).click();
    await expect(pageA.getByRole('dialog', { name: 'Revisar corrección' })).toBeVisible();
    await pageB.getByRole('combobox', { name: 'Estado' }).selectOption('all');
    await article(pageB, 46).getByRole('button', { name: 'Resolver condición' }).click();
    await editor(pageB).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageB.getByLabel('Nota de condición')).toBeHidden();
    assert.equal((await readCondition(condition46.id)).status, 'resolved');
    await pageA.getByRole('dialog', { name: 'Revisar corrección' }).getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(pageA.getByText('Versión actual: 5')).toBeVisible();
    await expect(editor(pageA).getByRole('button', { name: 'Revisar nueva corrección' })).toBeEnabled();
    await expect(pageA.getByLabel('Motivo de corrección')).toHaveValue('Incorrecta');
    await editor(pageA).getByRole('button', { name: 'Revisar nueva corrección' }).click();
    await expect(pageA.getByRole('dialog', { name: 'Revisar corrección' })).toContainText('Fuente actual');
    await pageA.screenshot({ path: path.join(__dirname, 's5-correct-vs-resolve.png'), fullPage: true });
    await pageA.getByRole('dialog', { name: 'Revisar corrección' }).getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(pageA.getByText('Corrección guardada.')).toBeVisible();
    current = await readCondition(condition46.id);
    assert.equal(current.status, 'entered_in_error', 'correction commits after renewed review');
    assert.equal(current.correction.reason, 'Incorrecta');
    output.correctVsResolve = { status: current.status, revision: current.revision };

    // 5. Correction hits an already-corrected source: terminal block.
    await pageA.getByRole('combobox', { name: 'Estado' }).selectOption('all');
    await article(pageA, 11).getByRole('button', { name: 'Corregir registro' }).click();
    await pageA.getByLabel('Motivo de corrección').fill('No aplica');
    await editor(pageA).getByRole('button', { name: 'Revisar corrección' }).click();
    await expect(pageA.getByRole('dialog', { name: 'Revisar corrección' })).toBeVisible();
    await pageB.getByRole('combobox', { name: 'Estado' }).selectOption('all');
    await article(pageB, 11).getByRole('button', { name: 'Corregir registro' }).click();
    await pageB.getByLabel('Motivo de corrección').fill('Ganó B');
    await editor(pageB).getByRole('button', { name: 'Revisar corrección' }).click();
    await pageB.getByRole('dialog', { name: 'Revisar corrección' }).getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(pageB.getByText('Corrección guardada.')).toBeVisible();
    await pageA.getByRole('dialog', { name: 'Revisar corrección' }).getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(pageA.getByText(/El original ya está registrado por error/)).toBeVisible();
    await expect(editor(pageA).getByRole('button', { name: 'Revisar nueva corrección' })).toBeDisabled();
    await expect(pageA.getByLabel('Motivo de corrección')).toHaveValue('No aplica');
    await pageA.screenshot({ path: path.join(__dirname, 's5-terminal-correct.png'), fullPage: true });
    output.terminalCorrect = { status: (await readCondition(condition11.id)).status };

    // 6. Failed current read blocks renewed save and retries with GET only.
    await editor(pageA).getByRole('button', { name: 'Cancelar condición' }).click();
    await pageA
      .getByRole('dialog', { name: 'Condición sin guardar' })
      .getByRole('button', { name: 'Descartar condición' })
      .click();
    await article(pageA, 21).getByRole('button', { name: 'Corregir registro' }).click();
    await pageA.getByLabel('Motivo de corrección').fill('Tercera');
    await editor(pageA).getByRole('button', { name: 'Revisar corrección' }).click();
    await expect(pageA.getByRole('dialog', { name: 'Revisar corrección' })).toBeVisible();
    await pageB.getByRole('combobox', { name: 'Estado' }).selectOption('all');
    await editOn(pageB, 21);
    await pageB.getByLabel('Nota de condición').fill('Remota21');
    await editor(pageB).getByRole('button', { name: 'Guardar condición' }).click();
    await expect(pageB.getByLabel('Nota de condición')).toBeHidden();
    let abortExactRead = true;
    await pageA.route(/\/api\/patients\/.*\/conditions\/[0-9a-f-]+$/, (route) => {
      if (abortExactRead) return route.abort();
      return route.continue();
    });
    await pageA.getByRole('dialog', { name: 'Revisar corrección' }).getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(pageA.getByText(/No pudimos cargar la versión actual/)).toBeVisible();
    await expect(editor(pageA).getByRole('button', { name: 'Revisar nueva corrección' })).toBeDisabled();
    abortExactRead = false;
    await editor(pageA).getByRole('button', { name: 'Cargar versión actual' }).click();
    await expect(pageA.getByText('Versión actual: 2')).toBeVisible();
    await expect(editor(pageA).getByRole('button', { name: 'Revisar nueva corrección' })).toBeEnabled();
    await editor(pageA).getByRole('button', { name: 'Revisar nueva corrección' }).click();
    await pageA.getByRole('dialog', { name: 'Revisar corrección' }).getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(pageA.getByText('Corrección guardada.')).toBeVisible();
    current = await readCondition(condition21.id);
    assert.equal(current.status, 'entered_in_error');
    assert.equal(current.note, 'Remota21', 'remote note untouched by correction');
    output.failedRead = { status: current.status, revision: current.revision, note: current.note };

    output.finalConditions = [
      await readCondition(condition36.id),
      await readCondition(condition46.id),
      await readCondition(condition11.id),
      await readCondition(condition21.id),
    ].map((item) => ({ tooth: item.tooth_fdi, status: item.status, revision: item.revision, note: item.note, surfaces: item.surfaces }));
    output.pageErrors = pageErrors;
    assert.deepEqual(pageErrors, [], 'zero page errors');
    fs.writeFileSync(path.join(__dirname, 's5-browser.json'), JSON.stringify(output, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
