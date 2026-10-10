'use strict';

/*
 * Task 0.1 matching-checkout reproduction harness.
 *
 * Reproduces Assistant findings F02 (unsent contextual work survives patient
 * removal with no explicit boundary), F03 (artifact loses historical patient
 * identity when the active patient is removed) and F06 (transient save failure
 * presented as an expired confirmation) against the matching-checkout build.
 *
 * Every /api/** request is intercepted. Unconfigured endpoints return HTTP 501
 * so no clinical or provider request can escape the browser. Asset requests are
 * remapped to the checkout build-parity bundle; unknown assets are aborted.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { createRequire } = require('module');

const OUT = __dirname;
const REPO = path.resolve(OUT, '../../../../..');
const AUDIT = path.join(REPO, 'docs/design/audits/assistant-2026-10-09/evidence');
const BUILD = path.join(AUDIT, 'build-parity/assets');
const requireFromFrontend = createRequire(path.join(REPO, 'app/frontend/package.json'));
const { chromium } = requireFromFrontend('playwright');

const T = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const U = '55555555-5555-4555-8555-555555555555';
const PATIENT = {
  id: P,
  first_name: 'Ana',
  last_name: 'Prueba sintética',
  rut_masked: '••.•••.•••-•',
  birth_date: '1990-01-01',
};
const DRAFT = {
  context: 'Control sintético',
  findings: 'Hallazgo registrado en nota de prueba.',
  assessment: '',
  treatment: 'Higiene indicada en nota de prueba.',
  follow_up: 'Control en seis meses.',
};

function makeArtifact(status = 'draft') {
  return {
    id: 'draft-audit',
    owner_user_id: U,
    thread_id: T,
    turn_id: 'turn-audit',
    patient_id: P,
    artifact_type: 'clinical_draft',
    status,
    source_note: 'Nota sintética: hallazgo e higiene. Control en seis meses.',
    generated_draft: { ...DRAFT, review_flags: [] },
    draft: { ...DRAFT, review_flags: [] },
    evolution_at: '2026-10-09T03:00:00Z',
    created_at: '2026-10-09T03:00:00Z',
    updated_at: '2026-10-09T03:00:00Z',
    resolved_at: null,
  };
}

function makeAction(artifact) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    thread_id: T,
    turn_id: artifact.turn_id,
    artifact_id: artifact.id,
    patient_id: P,
    action_type: 'save_evolution',
    proposal_payload: {
      evolution_id: '44444444-4444-4444-8444-444444444444',
      patient_id: P,
      evolution_at: artifact.evolution_at,
      raw_note: artifact.source_note,
      generated_text: 'Propuesta sintética',
      final_text: 'Hallazgo registrado en nota de prueba.',
    },
    proposal_hash: 'a'.repeat(64),
    status: 'pending',
    expires_at: '2026-10-09T23:00:00Z',
    created_at: '2026-10-09T03:01:00Z',
    resolved_at: null,
    result_resource_id: null,
    patient: PATIENT,
  };
}

function baseState(overrides = {}) {
  return {
    id: T,
    owner_user_id: U,
    title: 'Auditoría sintética',
    active_patient: null,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-10-09T03:00:00Z',
    updated_at: '2026-10-09T03:00:00Z',
    messages: [],
    artifacts: [makeArtifact()],
    pending_action: null,
    actions: [],
    ...overrides,
  };
}

const audit = { t: T, p: P, u: U, patient: PATIENT, state: baseState(), mode: 'idle', requests: [], blocked: [] };

async function control(page, patch) {
  return page.evaluate(async (body) => {
    const res = await fetch('/api/audit-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }, patch);
}

async function installApiFixtures(page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    audit.requests.push({ path: p, method });
    let status = 200;
    let body = {};
    try {
      if (p === '/api/audit-control') {
        if (method === 'POST') Object.assign(audit, req.postDataJSON());
        body = {
          t: T,
          p: P,
          u: U,
          patient: PATIENT,
          state: audit.state,
          requests: audit.requests,
          blocked: audit.blocked,
        };
      } else if (p === '/api/auth/me') {
        body = {
          id: U,
          email: 'audit@example.invalid',
          is_admin: false,
          messages_used_today: 0,
          messages_remaining_today: 25,
        };
      } else if (p === '/api/auth/config') {
        body = {
          mode: 'google',
          google_client_id: 'test.apps.googleusercontent.com',
          drive_enabled: true,
          drive_auto_onboard: false,
        };
      } else if (p === '/api/patients' || p === '/api/patients/search') {
        body = [PATIENT];
      } else if (p === '/api/clinical-threads/acquire') {
        body = { thread: audit.state, reused: true };
      } else if (p === '/api/clinical-threads') {
        body =
          method === 'GET'
            ? [
                {
                  ...audit.state,
                  active_patient_id: audit.state?.active_patient?.id ?? null,
                  preview: null,
                  approval_pending: Boolean(audit.state?.pending_action),
                },
              ]
            : audit.state;
      } else if (p === '/api/clinical-pending-work') {
        body = { items: [], next_cursor: null };
      } else if (p === `/api/clinical-threads/${T}/active-patient`) {
        const { patient_id } = req.postDataJSON();
        audit.state = { ...audit.state, active_patient: patient_id ? PATIENT : null };
        body = audit.state;
      } else if (p === `/api/clinical-threads/${T}`) {
        if (audit.mode === 'load-error') {
          status = 503;
          body = { detail: 'Synthetic unavailable' };
        } else {
          body = audit.state;
        }
      } else if (p.endsWith('/cancel')) {
        audit.state.active_turn_id = null;
        body = { status: 'cancelled' };
      } else if (p === '/api/google-drive/status') {
        body = { configured: true, status: 'connected', workspace: { folder_name: 'Auditoría sintética' } };
      } else if (p === '/api/google-drive/sources') {
        body = {
          files: [
            {
              id: 'source-synthetic',
              name: 'Documento sintético.txt',
              mimeType: 'text/plain',
              modifiedTime: '2026-10-09T03:00:00Z',
              version: '1',
              kind: 'text',
              editable: true,
            },
          ],
          next_page_token: null,
        };
      } else if (p.includes('/sources/source-synthetic')) {
        body = {
          id: 'source-synthetic',
          name: 'Documento sintético.txt',
          mimeType: 'text/plain',
          kind: 'text',
          editable: true,
          version: '1',
          content:
            'Documento de prueba. Higiene oral y control periódico. Sin datos personales.',
        };
      } else if (p === '/api/google-drive/evolution-journals/preferences') {
        body = { frequency: 'weekly' };
      } else if (p === '/api/google-drive/evolution-journals') {
        body = { journals: [] };
      } else if (p.includes('/files')) {
        body = { files: [], next_page_token: null };
      } else if (p.endsWith('/prepare-save')) {
        const artifact = audit.state.artifacts[0];
        const action = makeAction(artifact);
        audit.state = { ...audit.state, actions: [action], pending_action: action };
        body = action;
      } else if (p.includes('/artifacts/') && method === 'PATCH') {
        Object.assign(audit.state.artifacts[0], req.postDataJSON());
        body = audit.state.artifacts[0];
      } else if (p.includes('/clinical-actions/') && p.endsWith('/resolve')) {
        if (audit.mode === 'save-error') {
          status = 503;
          body = { detail: { code: 'EVOLUTION_SAVE_FAILED' } };
        } else {
          const action = audit.state.actions[0];
          action.status = 'approved';
          action.result_resource_id = '44444444-4444-4444-8444-444444444444';
          action.drive_export = { status: 'failed', error_code: 'DRIVE_EXPORT_FAILED' };
          audit.state.pending_action = null;
          body = action;
        }
      } else if (p.includes('/clinical-actions/') && p.endsWith('/edit')) {
        audit.state.actions[0].status = 'declined';
        audit.state.pending_action = null;
        body = { artifact_id: audit.state.artifacts[0].id };
      } else {
        status = 501;
        audit.blocked.push({ path: p, method });
        body = { detail: 'Audit blocked unconfigured endpoint' };
      }
    } catch (error) {
      status = 500;
      body = { detail: `Audit harness error: ${String(error)}` };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function installCheckoutAssets(page) {
  await page.route('**/assets/**', async (route) => {
    const name = route.request().url().split('/').pop();
    const mapped = name === 'index-hMjYLKeb.js' ? 'index-CNNUBSZj.js' : name;
    const allowed = ['index-CNNUBSZj.js', 'index-C3Y2UvuD.js', 'index-BzakEpcP.css'];
    if (allowed.includes(mapped)) {
      await route.fulfill({
        path: path.join(BUILD, mapped),
        contentType: mapped.endsWith('.css') ? 'text/css' : 'application/javascript',
      });
    } else {
      await route.abort();
    }
  });
}

async function installSyntheticStream(page) {
  await page.addInitScript(
    ({ t }) => {
      const original = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.pathname !== `/api/clinical-threads/${t}/turns` || init?.method !== 'POST') {
          return original(input, init);
        }
        let controller;
        const stream = new ReadableStream({
          start(ctrl) {
            controller = ctrl;
          },
        });
        window.__auditStream = {
          push(frame) {
            controller.enqueue(new TextEncoder().encode(frame));
          },
          close() {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          },
        };
        return Promise.resolve(
          new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
        );
      };
    },
    { t: T },
  );
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function servedAsset() {
  const html = await (await fetch('http://localhost:8000/')).text();
  const match = html.match(/\/assets\/([^"']+\.js)/);
  if (!match) throw new Error('Could not find served main JS asset in index.html');
  const name = match[1];
  const bytes = Buffer.from(await (await fetch(`http://localhost:8000/assets/${name}`)).arrayBuffer());
  return { name, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

async function servedCss() {
  const html = await (await fetch('http://localhost:8000/')).text();
  const match = html.match(/\/assets\/([^"']+\.css)/);
  if (!match) throw new Error('Could not find served CSS asset in index.html');
  const name = match[1];
  const bytes = Buffer.from(await (await fetch(`http://localhost:8000/assets/${name}`)).arrayBuffer());
  return { name, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

async function artifactText(page) {
  return page.getByRole('article', { name: 'Evolución clínica', exact: true }).innerText();
}

async function run() {
  if (!fs.existsSync(path.join(BUILD, 'index-CNNUBSZj.js'))) {
    throw new Error(`Missing checkout build-parity assets at ${BUILD}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-CL',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const observed = {};

  try {
    await installApiFixtures(page);
    await installCheckoutAssets(page);
    await installSyntheticStream(page);

    // --- F03: artifact loses historical patient identity when active patient is removed.
    audit.mode = 'idle';
    audit.state = baseState({ active_patient: PATIENT });
    await page.goto(`http://localhost:8000/a/${T}`);
    await page.getByRole('article', { name: 'Evolución clínica', exact: true }).waitFor();
    const f03Before = await artifactText(page);
    await page.getByRole('button', { name: 'Quitar paciente activo' }).click();
    await page.getByLabel('Consulta al asistente', { exact: true }).waitFor();
    await page.waitForTimeout(500);
    const f03After = await artifactText(page);
    await page.screenshot({ path: path.join(OUT, 'f03-artifact-identity.png') });
    observed.F03 = {
      expected:
        'Artifact retains its historical owner-scoped patient independently of the active selector.',
      observedBeforeRemovalHasPatient: f03Before.includes('Ana Prueba sintética'),
      observedAfterRemovalHasPatient: f03After.includes('Ana Prueba sintética'),
      artifactAfterRemoval: f03After,
    };

    // --- F02: unsent note + Drive attachment remain after patient removal, no boundary.
    audit.mode = 'idle';
    audit.state = baseState({ active_patient: PATIENT });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const composer = page.getByLabel('Nota clínica', { exact: true });
    await composer.waitFor();
    await composer.fill('Nota clínica sintética redactada en contexto de paciente.');
    await page.getByRole('button', { name: 'Abrir Google Drive' }).click();
    await page.getByRole('button', { name: 'Documento sintético.txt' }).click();
    await page.getByRole('button', { name: 'Adjuntar documento al mensaje' }).click();
    await page.getByRole('group', { name: 'Documentos adjuntos' }).waitFor();
    await page.getByRole('button', { name: 'Cerrar Google Drive' }).click();
    await page.waitForTimeout(300);
    const f02AttachBefore = await page
      .getByRole('group', { name: 'Documentos adjuntos' })
      .innerText();
    const f02DraftBefore = await composer.inputValue();
    await page.getByRole('button', { name: 'Quitar paciente activo' }).click();
    await page.waitForTimeout(500);
    const f02Dialogs = await page.getByRole('dialog').count();
    const f02AttachAfter = await page
      .getByRole('group', { name: 'Documentos adjuntos' })
      .innerText();
    const f02DraftAfter = await page.getByLabel('Consulta al asistente', { exact: true }).inputValue();
    await page.screenshot({ path: path.join(OUT, 'f02-unsent-context.png') });
    observed.F02 = {
      expected:
        'Patient change presents an explicit remain/preserve/discard boundary and never silently keeps patient-context work under no patient.',
      observedDraftBeforeRemoval: f02DraftBefore,
      observedAttachmentsBeforeRemoval: f02AttachBefore,
      observedConfirmationDialogs: f02Dialogs,
      observedDraftAfterRemoval: f02DraftAfter,
      observedAttachmentsAfterRemoval: f02AttachAfter,
    };

    // --- F06: transient save failure presented as an expired confirmation.
    const f06Artifact = makeArtifact('pending');
    const f06Action = makeAction(f06Artifact);
    audit.mode = 'save-error';
    audit.state = baseState({
      active_patient: PATIENT,
      artifacts: [f06Artifact],
      actions: [f06Action],
      pending_action: f06Action,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Revisar y guardar', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar evolución', exact: true }).click();
    await page.waitForTimeout(600);
    const f06Text = await artifactText(page);
    const f06Alerts = await page.getByRole('alert').allTextContents();
    const f06Controls = await page
      .getByRole('article', { name: 'Evolución clínica', exact: true })
      .getByRole('button')
      .allTextContents();
    await page.screenshot({ path: path.join(OUT, 'f06-save-error.png') });
    observed.F06 = {
      expected:
        'Transient save failure is distinguished from expiry, offers explicit recovery and reconciles canonical state before retry; expiration is never asserted without a canonical response.',
      observedArtifactText: f06Text,
      observedAlerts: f06Alerts,
      observedControls: f06Controls,
      observedClaimsExpired: f06Text.includes('expiró'),
      observedOffersRetryOrRecovery: f06Controls.some((label) => /Reintentar|Recuperar|Verificar/.test(label)),
    };
  } finally {
    await browser.close();
  }

  const provenance = {
    generated_at: new Date().toISOString(),
    audit_checkout: '7345f7a2e762220a19c638709e85d1b92ca70fed',
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim(),
    served_container: 'dynachat-app-blue (localhost:8000)',
    served_main_asset: await servedAsset(),
    served_css_asset: await servedCss(),
    checkout_build_asset: {
      name: 'index-CNNUBSZj.js',
      sanitized_sha256: sha256(path.join(BUILD, 'index-CNNUBSZj.js')),
      original_tested_sha256: '3e03c160bcf24fbbf4a2a1e9e2c08e15d355ca6a4011d6ec7cb631cc82209a32',
    },
    checkout_secondary_asset: {
      name: 'index-C3Y2UvuD.js',
      sanitized_sha256: sha256(path.join(BUILD, 'index-C3Y2UvuD.js')),
    },
    asset_interception:
      'served main JS remapped to checkout build-parity index-CNNUBSZj.js; unknown assets aborted',
    api_interception:
      'all /api/** intercepted; unconfigured endpoints return HTTP 501 and are recorded in blocked[]; no clinical or provider write can escape the browser',
    evidence_levels_preserved:
      'matching-checkout browser reproduction of frontend behavior; backend/DB atomicity, real providers, screen reader and devices remain unproven',
    note:
      'Retained checkout JS is sanitized (one Google Picker browser key removed); Picker not exercised. Runtime app and container untouched.',
  };

  const report = {
    task: '0.1',
    change: 'harden-clinical-workspace-continuity',
    findings: ['F02', 'F03', 'F06'],
    provenance,
    observed,
    blocked_unhandled_requests: audit.blocked,
    all_api_requests: audit.requests,
    console_errors: consoleErrors,
  };
  fs.writeFileSync(path.join(OUT, 'f02-f03-f06-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error('REPRODUCTION FAILED:', error);
  process.exitCode = 1;
});
