'use strict';

/*
 * Task 1.2 browser race proof for F01.
 *
 * Serves the fixed frontend from Vite and intercepts every /api/** request.
 * Reproduces the audit race: start a turn on thread A, Stop with a delayed
 * cancel, navigate to thread B, start a turn there, then let A's cancel settle.
 * Asserts B's client controller, Stop control and transcript survive.
 */

const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { createRequire } = require('module');

const OUT = __dirname;
const REPO = path.resolve(OUT, '../../../../..');
const FRONTEND = path.join(REPO, 'app/frontend');
const requireFromFrontend = createRequire(path.join(FRONTEND, 'package.json'));
const { chromium } = requireFromFrontend('playwright');

const PORT = 5200;
const BASE = `http://localhost:${PORT}`;
const A = '11111111-1111-4111-8111-111111111111';
const B = '99999999-9999-4999-8999-999999999999';
const U = '55555555-5555-4555-8555-555555555555';
const PATIENT = {
  id: '22222222-2222-4222-8222-222222222222',
  first_name: 'Ana',
  last_name: 'Prueba sintética',
  rut_masked: '••.•••.•••-•',
  birth_date: '1990-01-01',
};

function thread(id, title) {
  return {
    id,
    owner_user_id: U,
    title,
    active_patient: PATIENT,
    pending_action_patient: null,
    active_turn_id: null,
    created_at: '2026-10-09T03:00:00Z',
    updated_at: '2026-10-09T03:00:00Z',
    messages: [],
    artifacts: [],
    pending_action: null,
    actions: [],
  };
}

const cancels = [];

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Vite dev server did not become ready');
}

async function installApiFixtures(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const p = new URL(request.url()).pathname;
    const method = request.method();
    let status = 200;
    let body = {};
    if (p === '/api/auth/me') {
      body = { id: U, email: 'audit@example.invalid', is_admin: false, messages_remaining_today: 25 };
    } else if (p === '/api/auth/config') {
      body = { mode: 'google', google_client_id: 'test.apps.googleusercontent.com', drive_enabled: false };
    } else if (p === '/api/patients' || p === '/api/patients/search') {
      body = [PATIENT];
    } else if (p === '/api/clinical-threads') {
      body = [
        { ...thread(A, 'Auditoría sintética'), active_patient_id: PATIENT.id },
        { ...thread(B, 'Segunda conversación sintética'), active_patient_id: PATIENT.id },
      ];
    } else if (p === `/api/clinical-threads/${A}`) {
      body = thread(A, 'Auditoría sintética');
    } else if (p === `/api/clinical-threads/${B}`) {
      body = thread(B, 'Segunda conversación sintética');
    } else if (p === '/api/clinical-pending-work') {
      body = { items: [], next_cursor: null };
    } else if (p === '/api/google-drive/status') {
      body = { configured: false, status: 'disconnected', workspace: null };
    } else if (p.includes('/cancel')) {
      cancels.push({ path: p, method });
      await new Promise((resolve) => setTimeout(resolve, 1800));
      body = { status: 'cancelled' };
    } else {
      status = 501;
      body = { detail: 'Race harness blocked unconfigured endpoint' };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function installSyntheticStreams(page) {
  await page.addInitScript(
    ({ threadA, threadB }) => {
      const original = window.fetch.bind(window);
      window.__streams = {};
      window.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        const threadId = url.pathname.split('/').slice(-2)[0];
        if (init?.method !== 'POST' || !url.pathname.endsWith('/turns')) return original(input, init);
        if (threadId !== threadA && threadId !== threadB) return original(input, init);
        let controller;
        const stream = new ReadableStream({
          start(ctrl) {
            controller = ctrl;
          },
        });
        window.__streams[threadId] = { aborted: false };
        init.signal?.addEventListener('abort', () => {
          window.__streams[threadId].aborted = true;
          try {
            controller.error(new DOMException('Synthetic aborted', 'AbortError'));
          } catch {
            /* already closed */
          }
        });
        return Promise.resolve(
          new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
        );
      };
    },
    { threadA: A, threadB: B },
  );
}

async function main() {
  const vite = spawn('bun', ['x', 'vite', '--port', String(PORT), '--strictPort'], {
    cwd: FRONTEND,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = [];
  vite.stdout.on('data', (chunk) => serverLog.push(chunk.toString()));
  vite.stderr.on('data', (chunk) => serverLog.push(chunk.toString()));

  let report;
  try {
    await waitForServer(30000);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-CL' });
    page.setDefaultTimeout(15000);
    await installApiFixtures(page);
    await installSyntheticStreams(page);

    await page.goto(`${BASE}/a/${A}`);
    const composer = page.getByLabel('Nota clínica', { exact: true });
    await composer.fill('Primer turno sintético');
    await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
    await page.waitForFunction((threadA) => Boolean(window.__streams[threadA]), A);
    await page.getByRole('button', { name: 'Detener respuesta', exact: true }).click();

    await page.getByRole('button', { name: 'Segunda conversación sintética', exact: true }).click();
    await composer.waitFor();
    await composer.fill('Segundo turno sintético');
    await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
    await page.waitForFunction((threadB) => Boolean(window.__streams[threadB]), B);

    // A's cancel settles at ~1800ms; give the stale callbacks time to run.
    await page.waitForTimeout(2200);

    const secondAborted = await page.evaluate((threadB) => window.__streams[threadB].aborted, B);
    const stopVisible = await page.getByRole('button', { name: 'Detener respuesta', exact: true }).count();
    const transcript = await page.getByRole('log').innerText();
    await page.screenshot({ path: path.join(OUT, 'stop-race-fixed.png') });

    report = {
      task: '1.2',
      scenario: 'late Stop success for A after B starts',
      cancelRequests: cancels,
      secondAborted,
      stopVisible,
      transcriptHasSecondTurn: transcript.includes('Segundo turno sintético'),
      transcript,
      passed:
        secondAborted === false &&
        stopVisible === 1 &&
        transcript.includes('Segundo turno sintético'),
    };
    await browser.close();
  } finally {
    try {
      if (process.platform === 'win32') execSync(`taskkill /F /T /PID ${vite.pid}`, { stdio: 'ignore' });
      else vite.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }

  const result = {
    generated_at: new Date().toISOString(),
    head: execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim(),
    source: 'app/frontend dev server (fixed source), all /api/** intercepted',
    evidence_level:
      'browser race against fixed source; backend/DB atomicity and real providers remain unproven',
    ...report,
  };
  fs.writeFileSync(path.join(OUT, 'stop-race-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('STOP RACE FAILED:', error);
  process.exitCode = 1;
});
