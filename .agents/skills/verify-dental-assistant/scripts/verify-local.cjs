// Run from repo root with Bun. Uses the frontend's installed Playwright and Vite.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..');
const { chromium } = require(path.join(root, 'app/frontend/node_modules/@playwright/test'));
const { loadEnv } = require(path.join(root, 'app/frontend/node_modules/vite'));
const config = loadEnv('development', root, '');
const disposable = process.argv.includes('--disposable');
if (disposable) assert.equal(process.env.VERIFY_OWNED_PROJECT, 'ai-tutor-verification', 'Use verify-disposable.ps1 to establish stack ownership');
const base = disposable ? 'http://localhost:8002' : 'http://localhost:8001';
const run = disposable ? process.env.VERIFY_RUN_ID : `local-${new Date().toISOString().replace(/[:.]/g, '-')}`;
assert(run && /^[a-zA-Z0-9_-]+$/.test(run), 'Invalid verification run ID');
const evidence = path.join(root, '.playwright-cli/verification', run);
fs.mkdirSync(evidence, { recursive: true });
const report = {
  runtime: base,
  provenance: disposable ? 'Disposable Docker stack rebuilt from checkout by verify-disposable.ps1' : 'Pre-existing Docker instance; running build, not checkout freshness proof',
  boundary: 'Real UI and authenticated API; no mocks; no model/provider success claimed',
  features: [],
  cleanup: [],
  product_gaps: [],
};
const persist = () => fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
let browser;
let page;
const created = new Set();
const responseTasks = [];
const existing = new Set();
const failureLocation = error => error.stack?.match(/verify-local\.cjs:(\d+):(\d+)/)?.[0] ?? 'unavailable';

async function doctor() {
  const health = await fetch(`${base}/api/health`);
  assert(health.ok, 'Health HTTP failure');
  const body = await health.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.db_type, 'postgres');
  const auth = await fetch(`${base}/api/auth/config`);
  assert(auth.ok, 'Auth config HTTP failure');
  const mode = await auth.json();
  assert.equal(mode.mode, 'local');
  assert.equal(mode.drive_enabled, false);
  return { status: body.status, db_type: body.db_type, mode: mode.mode, drive_enabled: false };
}

async function feature(id, action, drive) {
  const entry = { id, action, status: 'running' };
  report.features.push(entry);
  persist();
  try {
    entry.observed = await drive();
    entry.status = entry.observed.status === 'verified-unreachable' ? 'verified-unreachable' : 'covered';
  } catch (error) {
    // Do not retain exception messages, which may include patient text or credentials.
    entry.status = 'failed';
    entry.error_type = error.name;
    entry.helper_location = failureLocation(error);
    entry.selector_ambiguous = error.message.includes('strict mode violation');
    report.doctor_after_failure = await doctor();
    await page.goto(`${base}/patients`);
    await page.getByRole('heading', { name: 'Pacientes', exact: true }).waitFor();
  } finally {
    persist();
  }
}

async function main() {
  report.doctor = await doctor();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-CL' });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('response', response => {
    if (response.request().method() !== 'POST') return;
    const url = new URL(response.url());
    if (!['/api/clinical-threads/acquire', '/api/clinical-threads/open-context'].includes(url.pathname)) return;
    responseTasks.push((async () => {
      if (!response.ok()) return;
      const body = await response.json();
      if (body.thread?.id && !existing.has(body.thread.id) && (body.reused === false || body.resolution === 'created')) {
        created.add(body.thread.id);
      }
    })());
  });

  report.current_step = 'protected route redirect';
  await page.goto(`${base}/patients`);
  await page.waitForURL(`${base}/login`);
  await page.getByRole('heading', { name: 'Iniciar sesión', exact: true }).waitFor();
  await page.screenshot({ path: path.join(evidence, 'login-blank.png') });
  await page.getByRole('link', { name: 'Regístrate' }).click();
  await page.getByRole('heading', { name: 'Crear cuenta', exact: true }).waitFor();
  await page.screenshot({ path: path.join(evidence, 'signup-blank.png') });
  await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click();
  assert(config.E2E_USER && config.E2E_PASSWORD, 'Existing E2E credentials required; no signup performed');
  if (disposable) {
    report.current_step = 'disposable UI signup';
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.getByLabel('Correo electrónico').fill(config.E2E_USER);
    await page.getByLabel('Contraseña (8+ caracteres)', { exact: true }).fill(config.E2E_PASSWORD);
    const signupResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/signup' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Registrarse', exact: true }).click();
    const signup = await signupResponse;
    report.signup_http_status = signup.status();
    assert.equal(signup.status(), 201, 'Disposable signup HTTP failure');
    await page.waitForURL(url => ['/patients', '/login'].includes(url.pathname));
    if (new URL(page.url()).pathname === '/login') {
      report.product_gaps.push({ feature: 'sign-in', action: 'Real UI signup', signup_http_status: 201, observed: 'Returned to /login instead of authenticated /patients', source: 'useAuth.tsx doSignup/refresh update user but do not advance auth status; RequireAuth redirects' });
    }
    report.current_step = 'fresh login after disposable signup';
    await context.clearCookies();
    await page.goto(`${base}/login`);
    await page.getByRole('heading', { name: 'Iniciar sesión', exact: true }).waitFor();
  }
  await page.getByLabel('Correo electrónico').fill(config.E2E_USER);
  await page.getByLabel('Contraseña', { exact: true }).fill(config.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  report.current_step = 'authenticated landing';
  await page.waitForURL(`${base}/patients`);
  await page.getByRole('heading', { name: 'Pacientes', exact: true }).waitFor();
  report.features.push({ id: 'sign-in', status: 'covered', action: 'Protected redirect, signup round trip, real UI login', observed: { redirected: true, signup_heading: true, authenticated_landing: '/patients' } });
  report.authenticated = (await page.request.get(`${base}/api/auth/me`)).ok();
  assert(report.authenticated);
  const threads = await page.request.get(`${base}/api/clinical-threads`);
  assert(threads.ok());
  const initialThreads = await threads.json();
  for (const thread of initialThreads) existing.add(thread.id);
  report.existing_thread_count = existing.size;
  persist();

  let patientPath;
  await feature('patients', disposable ? 'UI create/edit, reload persistence, search, dialog cancellation' : 'Search no-match, clear search, cancel create dialog, open existing detail', async () => {
    if (disposable) {
      await page.getByRole('button', { name: '+ Nuevo paciente', exact: true }).click();
      await page.getByLabel('Nombres', { exact: true }).fill('Verificacion');
      await page.getByLabel('Apellidos', { exact: true }).fill('Sintetica');
      await page.getByLabel('RUT', { exact: true }).fill('12345678-5');
      await page.getByRole('button', { name: 'Crear paciente', exact: true }).click();
      await page.waitForURL(/\/patients\/[a-f0-9-]+$/);
      patientPath = new URL(page.url()).pathname;
      await page.reload();
      await page.getByRole('button', { name: 'Editar paciente', exact: true }).click();
      await page.getByLabel('Apellidos', { exact: true }).fill('Sintetica Actualizada');
      await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      await page.getByText('Paciente actualizado', { exact: true }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: 'Verificacion Sintetica Actualizada', exact: true }).waitFor();
      await page.getByRole('link', { name: '‹ Pacientes', exact: true }).click();
    }
    await page.getByLabel('Buscar por nombre o RUT', { exact: true }).fill('VerificationNoMatch20261002');
    await page.getByText('No encontramos pacientes para', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
    await page.getByRole('button', { name: '+ Nuevo paciente', exact: true }).click();
    await page.getByLabel('Nombres', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const loadedPatients = await page.request.get(`${base}/api/patients`);
    assert(loadedPatients.ok());
    const patientBody = await loadedPatients.json();
    // Wait for the debounced search-clear response before inspecting list links.
    const patientList = Array.isArray(patientBody) ? patientBody : patientBody.patients;
    if (patientList?.length) await page.locator('main a[href^="/patients/"]').first().waitFor();
    const link = page.locator('main a[href^="/patients/"]').first();
    if (await link.count()) {
      patientPath = await link.getAttribute('href');
      await link.click();
      await page.getByRole('button', { name: 'Editar paciente', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Editar paciente', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar cambios', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    }
    return { no_match: true, search_cleared: true, create_cancelled: true, detail_and_edit_dialog: Boolean(patientPath), mutations: disposable ? 'UI create/edit persisted through reload; disposable database teardown' : 'not exercised on pre-existing database', owner_scoping: 'requires second account' };
  });

  await feature('evolutions', disposable ? 'Open capture form, attempt disabled generation, verify note retention' : 'Open new evolution and inspect capture controls without generating/saving', async () => {
    if (!patientPath) return { status: 'verified-unreachable', attempted: '/patients', prerequisite: 'Existing owned patient required' };
    await page.goto(`${base}${patientPath}`);
    await page.locator('main header').getByRole('link', { name: '+ Nueva evolución', exact: true }).click();
    await page.getByRole('heading', { name: 'Nueva evolución dental', exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Generar borrador con IA', exact: true }).isDisabled());
    await page.getByRole('textbox', { name: 'Nota clínica', exact: true }).waitFor();
    if (disposable) {
      const note = page.getByRole('textbox', { name: 'Nota clínica', exact: true });
      await note.fill('Consulta sintetica de verificacion: revision preventiva, sin sintomas ni identificadores.');
      await page.getByRole('button', { name: 'Generar borrador con IA', exact: true }).click();
      await page.getByText('No pudimos generar el borrador.', { exact: false }).waitFor();
      assert((await note.inputValue()).includes('Consulta sintetica de verificacion'));
      await note.fill('');
    }
    await page.goto(`${base}/patients`);
    return { new_form: true, empty_note_generation_disabled: true, disabled_generation_note_retained: disposable, review_save: 'unverified; isolated runtime disables clinical generation' };
  });

  await feature('library-chat', 'Open library, search an impossible term, clear and close', async () => {
    await page.goto(`${base}/chat`);
    await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Biblioteca de videos', exact: true });
    await dialog.waitFor();
    const search = page.getByRole('searchbox', { name: 'Buscar videos', exact: true });
    await Promise.race([search.waitFor(), page.getByText('Aún no hay videos en la base de conocimiento.', { exact: true }).waitFor()]);
    const populated = await search.isVisible();
    if (populated) {
      await search.fill('VerificationNoMatch20261002');
      await page.getByText('No hay videos que coincidan con', { exact: false }).waitFor();
      await search.fill('');
    }
    await page.getByRole('button', { name: 'Cerrar biblioteca de videos', exact: true }).click();
    assert(!(await dialog.isVisible()));
    return { library_opened: true, populated, search_no_match: populated, closed: true, rag_citations: 'unverified; no model invoked' };
  });

  await feature('clinical-assistant', disposable ? 'Patient selection/reload, contextual assistant, disabled turn, pending work' : 'Open assistant, inspect composer and pending work without changing thread context', async () => {
    await page.goto(`${base}/assistant`);
    await page.waitForURL(/\/a\/[a-f0-9-]+$/);
    await page.locator('textarea').waitFor();
    if (disposable && patientPath) {
      await page.getByRole('button', { name: 'Seleccionar paciente', exact: true }).first().click();
      await page.getByRole('option').first().click();
      await page.getByRole('button', { name: 'Cambiar paciente activo', exact: true }).first().waitFor();
      await page.reload();
      await page.getByRole('button', { name: 'Cambiar paciente activo', exact: true }).first().waitFor();
      await page.goto(`${base}${patientPath}`);
      const prepare = page.getByRole('button', { name: 'Preparar evolución', exact: true });
      await prepare.click();
      const panel = page.getByRole('complementary', { name: 'Asistente del paciente', exact: true });
      await panel.waitFor();
      assert((await panel.getByRole('textbox', { name: 'Nota clínica', exact: true }).inputValue()).includes('Quiero preparar una evolución'));
      await panel.getByRole('button', { name: 'Cerrar asistente', exact: true }).click();
      await panel.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.textContent?.includes('Preparar evolución'));
      await page.getByRole('button', { name: 'Asistente', exact: true }).click();
      await panel.waitFor();
      await panel.getByRole('link', { name: 'Abrir asistente completo', exact: true }).click();
      await page.waitForURL(/\/a\/[a-f0-9-]+$/);
      await page.getByRole('textbox', { name: 'Nota clínica', exact: true }).fill('Consulta sintetica de verificacion, sin identificadores.');
      await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
      await page.getByText('La asistencia clínica externa está deshabilitada.', { exact: false }).waitFor();
      await page.reload();
      await page.locator('textarea').waitFor();
    }
    await page.getByRole('button', { name: 'Pendientes', exact: true }).click();
    await page.getByRole('region', { name: 'Trabajo pendiente', exact: true }).waitFor();
    return { thread_route: true, composer_visible: true, pending_work_opened: true, patient_selection_and_disabled_turn: disposable && Boolean(patientPath), contextual_desktop_prefill_close_focus_reopen: disposable && Boolean(patientPath), generation_approval: 'unverified; model disabled' };
  });

  await feature('google-drive', 'Attempt Drive entry on authenticated local-mode assistant', async () => {
    if (!/\/a\/[a-f0-9-]+$/.test(new URL(page.url()).pathname)) {
      await page.goto(`${base}/assistant`);
      await page.waitForURL(/\/a\/[a-f0-9-]+$/);
      await page.locator('textarea').waitFor();
    }
    const configResponse = await page.request.get(`${base}/api/auth/config`);
    const auth = await configResponse.json();
    assert.equal(auth.mode, 'local');
    assert.equal(auth.drive_enabled, false);
    const launcher = page.getByRole('button', { name: 'Abrir Google Drive', exact: true });
    const visible = await launcher.isVisible();
    const disabled = visible ? await launcher.isDisabled() : null;
    if (visible && !disabled) {
      await launcher.click();
      await page.getByText('Google Drive no está disponible', { exact: true }).first().waitFor();
      await page.getByRole('button', { name: 'Cerrar Google Drive', exact: true }).first().click();
    }
    return { status: 'verified-unreachable', attempted: '/assistant', launcher_visible: visible, launcher_disabled: disabled, unavailable_ui: visible && !disabled, prerequisite: 'Google-mode instance with Drive enabled and human login/consent; local E2E disables Drive', provider_read: 'not exercised' };
  });
}

(async () => {
  try {
    await main();
  } catch (error) {
    report.fatal = { type: error.name, step: report.current_step ?? 'doctor', helper_location: failureLocation(error) };
    process.exitCode = 1;
  } finally {
    await Promise.allSettled(responseTasks);
    if (page) {
      for (const id of created) {
        try {
          const deleted = await page.request.delete(`${base}/api/clinical-threads/${id}`);
          const absent = await page.request.get(`${base}/api/clinical-threads/${id}`);
          const clean = deleted.status() === 204 && absent.status() === 404;
          report.cleanup.push({ created_thread_deleted: clean });
          if (!clean) process.exitCode = 1;
        } catch {
          report.cleanup.push({ created_thread_deleted: false });
          process.exitCode = 1;
        }
      }
    }
    if (browser) await browser.close();
    report.browser_closed = true;
    report.outcome = report.fatal || report.product_gaps.length || report.features.some(item => item.status === 'failed') ? 'blocked' : 'partial-live-coverage';
    persist();
    assert(fs.existsSync(path.join(evidence, 'report.json')));
    console.log(JSON.stringify({ outcome: report.outcome, evidence: path.relative(root, evidence), features: report.features.map(item => ({ id: item.id, status: item.status })) }));
    if (report.outcome === 'blocked') process.exitCode = 1;
  }
})();
