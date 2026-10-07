import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

const proofCredentials = { email: process.env.E2E_PROOF_USER ?? `notes-${randomUUID()}@example.com`, password: process.env.E2E_PROOF_PASSWORD ?? randomUUID() };
function proofPath(name: string): string {
  return path.resolve(__dirname, '../../../openspec/changes/mirror-dental-diagnosis-workspace/evidence', name);
}
async function authenticateProof(page: Page): Promise<void> {
  const login = await page.request.post('/api/auth/login', { data: proofCredentials });
  if (login.status() === 401) {
    const signup = await page.request.post('/api/auth/signup', { data: proofCredentials });
    expect(signup.status()).toBe(201);
  } else expect(login.ok()).toBeTruthy();
}

function syntheticRut(): string {
  const body = String(20000000 + Math.floor(Math.random() * 60000000));
  let sum = 0;
  for (let index = 0; index < body.length; index++) sum += Number(body[body.length-1-index]) * (2+index%6);
  const check = 11-sum%11;
  return `${body}-${check === 11 ? '0' : check === 10 ? 'K' : check}`;
}

test.use({ storageState: { cookies: [], origins: [] } });
test('mirror slice9 notes binding, template, exact retry, conflict and responsive draft', async ({ page }) => {
  test.skip(process.env.E2E_BASE_URL !== 'http://localhost:8009', 'Owned disposable Docker proof only');
  await authenticateProof(page);
  const patient = await page.request.post('/api/patients', { data: { first_name: 'Sintética', last_name: 'Notas', rut: syntheticRut() } });
  expect(patient.status()).toBe(201);
  const patientId = (await patient.json()).id;
  const base = `/api/patients/${patientId}/clinical-notes`;
  await page.goto(`/patients/${patientId}?tab=clinical&clinical=diagnosis`);
  await expect(page.getByRole('heading', { name: 'Odontograma FDI' })).toBeVisible();
  if (!(await page.getByLabel('Texto de nota clínica').isVisible())) await page.getByRole('button', { name: 'Notas', exact: true }).click();
  await page.getByLabel('Texto de nota clínica').fill('Observación sintética');
  await page.getByLabel('Plantillas', { exact: true }).selectOption('diagnosis_caries');
  await expect(page.getByLabel('Texto de nota clínica')).toHaveValue(/Observación sintética\n\nHallazgo:/);
  // A wide rail permits chart interaction; no note is written by chart hover.
  if (await page.getByRole('dialog', { name: 'Notas clínicas', exact: true }).isVisible()) await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: /^Pieza 16:/ }).hover();
  await page.getByRole('button', { name: /^Pieza 16:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Pieza 16', exact: true })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  if (!(await page.getByLabel('Texto de nota clínica').isVisible())) await page.getByRole('button', { name: 'Notas', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Asociar al diente 16' })).toBeChecked();
  expect((await (await page.request.get(base)).json()).total).toBe(0);
  await page.getByRole('checkbox', { name: 'Asociar al diente 16' }).uncheck();
  const draft = await page.getByLabel('Texto de nota clínica').inputValue();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (!(await page.getByLabel('Texto de nota clínica').isVisible())) await page.getByRole('button', { name: 'Notas', exact: true }).click();
  await expect(page.getByLabel('Texto de nota clínica')).toHaveValue(draft);
  await expect(page.getByRole('checkbox', { name: 'Asociar al diente 16' })).not.toBeChecked();
  await expect(page.getByLabel('Texto de nota clínica')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('tab', { name: 'Información', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nota sin guardar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await page.getByRole('button', { name: 'Notas', exact: true }).click();
  await expect(page.getByLabel('Texto de nota clínica')).toHaveValue(draft);
  let frozen: unknown;
  await page.route(`**${base}`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    frozen = route.request().postDataJSON(); await route.fetch(); await route.abort();
  }, { times: 1 });
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reintentar misma operación' })).toBeVisible();
  const retry = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith(base));
  await page.getByRole('button', { name: 'Reintentar misma operación' }).click();
  expect((await retry).postDataJSON()).toEqual(frozen);
  await expect(page.getByRole('button', { name: 'Añadir nota' })).toBeVisible();
  const created = (await (await page.request.get(base)).json()).items[0];
  expect(created.tooth_fdi).toBeNull();
  await page.getByRole('button', { name: 'Editar nota' }).click();
  await page.getByLabel('Texto de nota clínica').fill('Texto local conservado');
  const remote = await page.request.patch(`${base}/${created.id}`, { data: { operation_id: randomUUID(), expected_revision: 1, body: 'Texto remoto' } });
  expect(remote.status()).toBe(200);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Versión guardada: Texto remoto')).toBeVisible();
  await expect(page.getByLabel('Texto de nota clínica')).toHaveValue('Texto local conservado');
  await page.getByRole('button', { name: 'Conservar texto local sobre versión actual' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Añadir nota' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar nota' }).click();
  await page.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(page.getByRole('dialog', { name: 'Eliminar nota', exact: true })).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Notas', exact: true }).click();
  await expect(page.getByText('Sin notas', { exact: true })).toBeVisible();
  expect((await (await page.request.get(`${base}/${created.id}/revisions`)).json()).total).toBe(4);
  await test.info().attach('slice9-identities', { body: JSON.stringify({ patientId, noteId: created.id }), contentType: 'application/json' });
  await page.screenshot({ path: proofPath('slice9-narrow-notes.png') });
});

test('mirror slice7 anatomy, layered families, colors, legend and accessible narrow chart', async ({ page }) => {
  test.skip(process.env.E2E_BASE_URL !== 'http://localhost:8009', 'Owned disposable Docker proof only');
  await authenticateProof(page);
  const patient = await page.request.post('/api/patients', { data: { first_name: 'Sintética', last_name: 'Anatomía', rut: syntheticRut() } });
  expect(patient.status()).toBe(201);
  const patientId = (await patient.json()).id;
  const base = `/api/patients/${patientId}`;
  for (const [tooth, code, surfaces] of [[16,'caries',['M']], [26,'missing',[]], [11,'rotated',[]], [21,'displaced',[]], [38,'unerupted',[]], [48,'fracture',[]], [23,'periapical_lt_2mm',[]], [24,'periapical_2_4mm',[]], [25,'periapical_gt_4mm',[]], [12,'pulpitis',[]], [15,'incipient_caries',['O']], [44,'pigmentation',['V']]] as const) {
    const response = await page.request.post(`${base}/conditions`, { data: { id: randomUUID(), dentition: 'permanent', tooth_fdi: tooth, condition_code: code, surfaces, note: null } });
    expect(response.status()).toBe(201);
  }
  const saved: { id: string; variant_id: string }[] = [];
  for (const [tooth, variant, surfaces] of [[16,'REST-CROWN-ZIR',[]], [16,'ENDO-UNI',[]], [26,'SURG-IMP-TI',[]], [17,'ENDO-MED-REFRESH',[]], [18,'ENDO-URGENT',[]], [41,'CORE-ENDO-OVERFILL',[]], [36,'REST-COMP',['M']], [37,'REST-AMAL',['O']], [45,'REST-TEMP',['D']], [46,'PREV-SEAL',['V']], [47,'REST-VEN-PORC',['L']], [34,'REST-INLAY-CER',['M','O']], [35,'REST-OVER-CER',[]], [31,'ORTO-BRACK',[]], [32,'CORE-TUBE',[]], [33,'CORE-BAND',[]], [42,'ORTO-ATTACH',[]], [43,'ORTO-RET-FIX',[]], [27,'SURG-APEC',[]]] as const) {
    const response = await page.request.post(`${base}/dental-treatments`, { data: { id: randomUUID(), operation_id: randomUUID(), expected_revision: 0, variant_id: variant, dentition: 'permanent', teeth: [{ tooth_fdi: tooth, surfaces, role: 'tooth' }] } });
    expect(response.status()).toBe(201);
    saved.push((await response.json()).committed);
  }
  for (const treatment of [
    { variant_id: 'REST-BRIDGE-MC', teeth: [{ tooth_fdi: 14, role: 'pillar', surfaces: [] }, { tooth_fdi: 15, role: 'pontic', surfaces: [] }, { tooth_fdi: 16, role: 'pillar', surfaces: [] }] },
    { variant_id: 'REST-SPLINT-PERIO', teeth: [{ tooth_fdi: 41, role: 'tooth', surfaces: [] }, { tooth_fdi: 42, role: 'tooth', surfaces: [] }] },
    { variant_id: 'REST-CROWN-IMPL-PROV', teeth: [{ tooth_fdi: 28, role: 'tooth', surfaces: [] }] },
    { variant_id: 'ENDO-POST-FIBER', teeth: [{ tooth_fdi: 13, role: 'tooth', surfaces: [] }] },
    { variant_id: 'REST-SPLINT-OCC', arch: 'upper', teeth: [] },
  ]) {
    const response = await page.request.post(`${base}/dental-treatments`, { data: { id: randomUUID(), operation_id: randomUUID(), expected_revision: 0, dentition: 'permanent', ...treatment } });
    expect(response.status()).toBe(201);
    saved.push((await response.json()).committed);
  }
  await page.goto(`/patients/${patientId}?tab=clinical&clinical=diagnosis`);
  await expect(page.locator('[data-profile]')).toHaveCount(32);
  expect(await page.locator('[data-profile]').evaluateAll(nodes => new Set(nodes.map(n => n.getAttribute('d'))).size)).toBeGreaterThanOrEqual(8);
  await expect(page.locator('[data-natural-root-hidden]')).toHaveCount(3);
  await expect(page.locator('[data-pulp-level="root_canal_half"]')).toHaveCount(1);
  await expect(page.locator('[data-pulp-level="root_canal_two_thirds"]')).toHaveCount(1);
  const legend = page.locator('details').filter({ has: page.getByText('Leyenda de conceptos', { exact: true }) });
  expect(await legend.getAttribute('open')).toBeNull();
  await legend.locator('summary').click();
  await expect(legend.locator('section')).toHaveCount(5);
  await legend.locator('summary').click();
  const categories = page.getByRole('group', { name: 'Categorías', exact: true });
  await categories.getByRole('button', { name: 'Endodoncia', exact: true }).click();
  const paletteColor = await page.getByRole('button', { name: 'Endodoncia unirradicular', exact: true }).locator('svg').evaluate(node => getComputedStyle(node).color);
  const pulpColor = await page.locator(`[data-clinical-layer="${saved.find(r => r.variant_id === 'ENDO-UNI')?.id}"]`).evaluate(node => getComputedStyle(node).color);
  expect(paletteColor).toBe('rgb(167, 139, 250)'); expect(pulpColor).toBe('rgb(96, 165, 250)');
  await categories.getByRole('button', { name: 'Diagnóstico', exact: true }).click();
  await page.getByRole('button', { name: 'Caries', exact: true }).click();
  await page.getByRole('button', { name: /^Pieza 16:/ }).hover();
  await expect(page.locator('[data-preview-tool="caries"]')).toHaveCount(1);
  expect(await page.locator('.dental-preview').evaluate(node => getComputedStyle(node).animationDuration)).toBe('1s');
  const surface = await page.locator('[data-arch-tooth="14"] [data-surface="M"]').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x+r.width/2, y: r.y+r.height/2 }; });
  await page.mouse.click(surface.x, surface.y);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get(`${base}/conditions`)).json()).items.find((record: { tooth_fdi: number; condition_code: string }) => record.tooth_fdi === 14 && record.condition_code === 'caries')?.surfaces).toEqual(['M']);
  await page.keyboard.press('Escape');
  const planId = randomUUID();
  expect((await page.request.post(`${base}/clinical-plans`, { data: { id: planId, operation_id: randomUUID(), expected_revision: 0, title: 'Plan visual' } })).status()).toBe(201);
  const plannedId = randomUUID();
  expect((await page.request.post(`${base}/clinical-plans/${planId}/items`, { data: { id: randomUUID(), operation_id: randomUUID(), expected_revision: 1, treatment: { id: plannedId, variant_id: 'ENDO-UNI', dentition: 'permanent', teeth: [{ tooth_fdi: 36 }] }, stages: [{ label: 'Sesión visual' }] } })).status()).toBe(201);
  await page.getByRole('button', { name: 'Planificación', exact: true }).click();
  await page.getByRole('button', { name: 'Plan visual · Borrador', exact: true }).click();
  await page.getByRole('combobox', { name: 'Procedimiento', exact: true }).selectOption('ORTO-BRACK');
  await expect(page.locator(`[data-clinical-layer="${plannedId}"]`)).toHaveAttribute('opacity','0.7');
  await expect(page.locator('[data-planned-marker]')).toHaveCount(1);
  expect(await page.locator('[data-planned-marker]').evaluate(node => node.closest('[data-anatomical-scale]') === null)).toBe(true);
  await page.getByRole('img', { name: /Odontograma/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: proofPath('slice7-planned-marker.png') });
  await page.getByRole('button', { name: 'Diagnóstico', exact: true }).click();
  await page.getByRole('button', { name: 'Descartar y continuar', exact: true }).click();
  await expect(page.locator(`[data-clinical-layer="${plannedId}"]`)).toHaveCount(0);
  for (const [width,height] of [[1440,900],[1280,800],[1024,768],[768,1024],[430,932],[390,844]]) {
    await page.setViewportSize({ width,height });
    expect(await page.evaluate(() => innerWidth)).toBe(width);
    await page.locator('[aria-label="Arcadas dentales desplazables"]').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: proofPath(`slice7-families-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Temporal', exact: true }).click();
  await expect(page.locator('[data-profile]')).toHaveCount(20);
  await page.locator('[aria-label="Arcadas dentales desplazables"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: proofPath('slice7-primary-390.png') });
  await page.getByRole('button', { name: 'Permanente', exact: true }).click();
  await page.getByRole('button', { name: /^Pieza 16:/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Pieza 16', exact: true })).toBeVisible();
  expect(await page.locator('.dental-selection-ring').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await page.keyboard.press('Escape');
  const notes = page.getByRole('button', { name: 'Notas', exact: true });
  await notes.scrollIntoViewIfNeeded();
  expect(await notes.evaluate(node => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2) === node; })).toBe(true);
  const zoom = await page.context().newCDPSession(page);
  // Model 200% desktop zoom: half-sized CSS viewport with doubled pixel density.
  await zoom.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 450, deviceScaleFactor: 2, mobile: false });
  expect(await page.evaluate(() => ({ width: innerWidth, density: devicePixelRatio }))).toEqual({ width: 720, density: 2 });
  await notes.click();
  await expect(page.getByLabel('Texto de nota clínica')).toBeVisible();
  await page.getByLabel('Texto de nota clínica').fill('Prueba sintética de reflujo al 200%');
  await page.getByRole('button', { name: 'Guardar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Añadir nota' })).toBeVisible();
  const zoomCapture = await zoom.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(proofPath('slice7-200-percent-notes.png'), Buffer.from(zoomCapture.data, 'base64'));
  await test.info().attach('slice7-colors-identities', { body: JSON.stringify({ patientId, saved, paletteColor, pulpColor }), contentType: 'application/json' });
});
